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

const lock = () => {
	dblock = true
}

const unlock = () => {
	setTimeout(() => {
		dblock = false		
	}, 1000)
}



const getSources = async bridge => {
	commit = await bridge.getHeadCommit()
	if(!commit) return
	console.log("====================================================")	
	console.log("COMMIT: ",commit.id)
	
	let readySources = await bridge.getSources(commit)
	console.log(`READY: ${readySources.map( d => d.info.name).join(", ")}`)

	let { valid, invalid } = bridge.validate(readySources)
	
	console.log(`VALID: ${valid.map( d => d.info.name).join(", ")}`)
	console.log(`INVALID: ${invalid.map( d => d.info.name).join(", ")}`)
	
	await bridge.updateSources({ commit, sources: valid})
	await bridge.updateSources({ commit, sources: invalid})
	
	return valid
}


const getTask = source => async () => {

	console.log(source.info.name)
	
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
	console.log(`Generate task for scanany "${message.scraper.scanany.name}" with params \n${message.scraper.scanany.params}`)
	// console.log("*****************", message.scraper.scanany.params)
}



const mainExecute = bridge => async () => {

	if(dblock){
		// console.log(`Ignored by lock`)
		return
	}

	console.log(`Instance ${scheduleId} version 1.0.1 at ${new Date()} ${(dblock) ? '*** LOCKED ***' : ''}`)
	lock()
	
	let sources = await getSources(bridge)
	if(!sources) return

	console.log("====================================================")	
		
	let s = sources.map(d => d.id)
	let c = cronSources.map(d => d.id)

	let toStart = difference(s, c)
	console.log("--- toStart:", toStart.map( id => find(sources, s => s.id == id).info.name).join(", "))
	let toStop = difference(c, s)
	console.log("--- toStop",toStop.map( id => find(cronSources, s => s.id == id).info.name).join(", "))
	
	let toUpdate = intersection(c,s)
	console.log("--- toUpdate",toUpdate.map( id => find(sources, s => s.id == id).info.name).join(", "))
	
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
		console.log(`*** Stop shedule for ${f.info.name} with scanany "${f.scanany.script}"" at "${f.schedule.cron}"`)
		f.schedule.task.cancel()
		remove(cronSources, d => d.id == id)
	})

	toRestart.forEach( id => {
		let f = find(cronSources, d => d.id == id)
		console.log(`*** Restart  shedule for ${f.info.name} with scanany "${f.scanany.script}" at "${f.schedule.cron}"`)
		f.schedule.task.cancel()
		remove(cronSources, d => d.id == id)
		f = find(sources, d => d.id == id)
		f.schedule.task = cron.scheduleJob(f.schedule.cron, getTask(f))
		cronSources.push(f)
	})

	toStart.forEach( id => {
		let f = find(sources, d => d.id == id)
		console.log(`*** Start  shedule for ${f.info.name} with scanany "${f.scanany.script}" at "${f.schedule.cron}"`)
		f.schedule.task = cron.scheduleJob(f.schedule.cron, getTask(f))
		cronSources.push(f)
	})

	console.log("--- Sheduled sources:", cronSources.map(d => d.info.name).join(", "))
	
	console.log("----------------------------------------------------------------------------------------------")

	unlock()
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
				message: `Stop by termination of the shedule instance ${scheduleId} at ${moment(new Date()).format("YY-MM-DD HH:mm:ss")}`	
			}
			
			s.schedule.task.cancel()
			delete s.schedule.task
			delete s.schedule.activatedAt
			delete s.executable

		})

		await bridge.updateSources({ commit, sources: cronSources})

		mainTask.cancel()

		bridge.close()

		cron.gracefulShutdown().then(() => {
			console.log(`Terminate scheduler instance ${scheduleId} at ${new Date()}`)
			process.exit(0)
		})

	}

 }

