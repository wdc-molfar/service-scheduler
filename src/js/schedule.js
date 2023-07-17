const cron = require("node-schedule")
const {intersection, difference, find, remove} = require("lodash")
const moment = require("moment")
const Bridge = require("./mongo-bridge")
const { equals } = require("./utils")


let cronSources = []
let scheduleId = require("uuid").v4()
let bridge
let options
let mainTask
let commit
let publisher



let dblock = false


const date = () => moment().format("YYYY-MM-DD HH:mm:ss")

const lock = () => {
	dblock = true
	console.log(`${date()} INFO: (lock) Lock query queue`)
}

const unlock = () => {
	setTimeout(() => {
		dblock = false
		console.log(`${date()} INFO: (unlock) Unlock query queue`)
		console.log("------------------------------------------------------------------\n")
	}, 3000)
}


const getSources = async bridge => {
	try {
	
		commit = await bridge.getHeadCommit()
		if(!commit) {
			console.log(`${date()} WARNING: (getSources) Last commit not exists`)
			return
		}	
		console.log(`${date()} INFO: (getSources) Last Source commit: ${commit.id}`)
		
		let readySources = await bridge.getSources(commit)

		if(!readySources) {
			console.log(`${date()} WARNING:(getSources) Ready sources not exists`)
			return
		}	
		

		console.log(`${date()} INFO: (getSources) Ready sources:\n ${readySources.map( d => d.info.name).join("\n")}`,"\n")

		let { valid, invalid } = bridge.validate(readySources)
		
		console.log(`${date()} INFO: (getSources) Valid sources:\n ${valid.map( d => d.info.name).join("\n")}`,"\n")
		console.log(`${date()} INFO: (getSources) Invalid sources:\n ${invalid.map( d => d.info.name).join("\n")}`,"\n")
		
		await bridge.updateSources({ commit, sources: valid, instance: scheduleId})
		await bridge.updateSources({ commit, sources: invalid, instance: scheduleId})
		
		return valid
	
	} catch (e) {

		console.log(`${date()} ERROR: (getSources) ${e.toString()}`)
	
	}	
}


const getTask = source => async () => {

	try {
	
		let message = {
			schedule:{
				id: scheduleId,
				version: "1.0.1",
				source: source.id,
				name: source.info.name,
				activatedAt: new Date() 
			},
			scraper:{
				scanany:{
					name: source.scanany.script,
					script: source.executable.script,
					params: source.scanany.params
				}
			}
		}

		publisher.send(message)
		console.log(`${date()} INFO: (getTask) Task for ${source.info.name}`)
	} catch (e){

		console.log(`${date()} ERROR: (getTask)${e.toString()}`)

	}	
}



const mainExecute = bridge => async () => {
	
	try {
		
		console.log("----------------------- mainExecute -----------------------------")

		if(dblock){
			console.log(`${date()} > WARNING: (mainExecute) Ignore sync by lock`)
			console.log("-------------------------------------------------------------------")
			
			return
		}

		console.log(`${date()}: INFO: (mainExecute) Instance ${scheduleId} version 1.0.1 ${(dblock) ? '*** LOCKED ***' : ''}`)
		lock()
		
		let sources = await getSources(bridge)

		if(!sources) {
			console.log(`${date()}: WARNING: (mainExecute) Sources not exists`)
			unlock()
			return
		}	

			
		let s = sources.map(d => d.id)
		let c = cronSources.map(d => d.id)

		let toStart = difference(s, c)
		console.log("\n--- toStart\n", toStart.map( id => find(sources, s => s.id == id).info.name).join("\n"),"\n")
		let toStop = difference(c, s)
		console.log("\n--- toStop\n",toStop.map( id => find(cronSources, s => s.id == id).info.name).join("\n"),"\n")
		
		let toUpdate = intersection(c,s)
		console.log("\n--- toUpdate\n",toUpdate.map( id => find(sources, s => s.id == id).info.name).join("\n"),"\n")
		
		let toRestart = toUpdate.filter( id => {
			let newValue = find(sources, d => d.id == id)
			let oldValue = find(cronSources, d => d.id == id)
			return !equals(newValue, oldValue,[
				"executable.script",
				"scanany.params",
				"schedule.cron"
			])
		})


		toStop.forEach( id => {
			let f = find(cronSources, d => d.id == id)
			console.log(`${date()} INFO: (mainExecute) STOP ${f.info.name} at "${f.schedule.cron}"`)
			f.schedule.task.cancel()
			remove(cronSources, d => d.id == id)
		})

		toRestart.forEach( id => {
			let f = find(cronSources, d => d.id == id)
			console.log(`${date()} INFO: (mainExecute) RESTART ${f.info.name} at "${f.schedule.cron}"`)
			f.schedule.task.cancel()
			remove(cronSources, d => d.id == id)
			f = find(sources, d => d.id == id)
			f.schedule.task = cron.scheduleJob(f.schedule.cron, getTask(f))
			cronSources.push(f)
		})

		toStart.forEach( id => {
			let f = find(sources, d => d.id == id)
			console.log(`${date()} INFO: (mainExecute) START ${f.info.name} at "${f.schedule.cron}"`)
			f.schedule.task = cron.scheduleJob(f.schedule.cron, getTask(f))
			cronSources.push(f)
		})

		console.log(`${date()} INFO: (mainExecute)  Sheduled sources:\n ${cronSources.map(d => d.info.name).join("\n")}\n\n`)
		
		unlock()

	} catch (e)	{

		console.log(`${date()} ERROR: (mainExecute)  ${e.toString()}`)

	}

}



module.exports = {
 	
 	configure: async config => {
 		options = config.service.schedule
 		publisher = config.publisher
 		bridge = await Bridge.create(options)	
 	},

 	start: () => {
 		mainTask = cron.scheduleJob(options.cron, mainExecute(bridge))
	},

	stop: async () => {

		cronSources.forEach( s => {
			
			s.schedule.process = {
				type: "warning",
				message: `Stop by termination of the shedule instance ${scheduleId} at ${moment(date()).format("YY-MM-DD HH:mm:ss")}`	
			}
			
			s.schedule.task.cancel()
			delete s.schedule.task
			delete s.schedule.activatedAt
			delete s.executable

		})

		await bridge.updateSources({ commit, sources: cronSources, instance: scheduleId})

		mainTask.cancel()

		bridge.close()

		cron.gracefulShutdown().then(() => {
			console.log(`Terminate scheduler instance ${scheduleId} at ${date()}`)
			process.exit(0)
		})

	}

 }

