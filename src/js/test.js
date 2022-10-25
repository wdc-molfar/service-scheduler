const cron = require("node-schedule")
const {intersection, difference, find, remove} = require("lodash")
const Bridge = require("./mongo-bridge")
const { equals } = require("./utils")

const options = {
	url: "mongodb+srv://jace:jace@molfar-sources-clone.8g31h44.mongodb.net/test",
	// "mongodb+srv://jace:jace@molfar-sources.tjmxbnn.mongodb.net/?retryWrites=true&w=majority",
	db: "sources",
	collection: {
		sources: "sources",
		commits: "commits",
	 	scanany: "scanany"
	},
	schedule:{	
		interval: "*/5 * * * * *"
	}	
}


let cronSources = []
let scheduleId = require("uuid").v4()


const getSources = async bridge => {
	let commit = await bridge.getHeadCommit()
	console.log("COMMIT: ",commit.id)
	
	let readySources = await bridge.getSources(commit)
	let { valid, invalid } = bridge.validate(readySources)
	
	await bridge.updateSources({ commit, sources: valid})
	await bridge.updateSources({ commit, sources: invalid})
	
	return valid
}


const getTask = source => async () => {
	console.log(source.scanany)

	let message = {
		shedule:{
			id: scheduleId,
			source: source.id,
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

	console.log(message)
}



const mainExecute = bridge => async () => {

	// const bridge = await Bridge.create(options)
	console.log(`Instance ${scheduleId} at ${new Date()}`)

	let sources = await getSources(bridge)
	
	let s = sources.map(d => d.id)
	let c = cronSources.map(d => d.id)

	let toStart = difference(s, c)
	let toStop = difference(c, s)
	let toUpdate = intersection(c,s)
	
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
		console.log(`Stop shedule for ${f.info.name} with scanany "${f.scanany.script}"" at "${f.schedule.cron}"`)
		f.schedule.task.cancel()
		remove(cronSources, d => d.id == id)
	})

	toRestart.forEach( id => {
		let f = find(cronSources, d => d.id == id)
		console.log(`Restart  shedule for ${f.info.name} with scanany "${f.scanany.script}" at "${f.schedule.cron}"`)
		f.schedule.task.cancel()
		remove(cronSources, d => d.id == id)
		f = find(sources, d => d.id == id)
		f.schedule.task = cron.scheduleJob(f.schedule.cron, getTask(f))
		cronSources.push(f)
	})

	toStart.forEach( id => {
		let f = find(sources, d => d.id == id)
		console.log(`Start  shedule for ${f.info.name} with scanany "${f.scanany.script}" at "${f.schedule.cron}"`)
		f.schedule.task = cron.scheduleJob(f.schedule.cron, getTask(f))
		cronSources.push(f)
	})

	console.log("Sheduled sources:", cronSources.map(d => d.info.name).join(", "))
	
	console.log("----------------------------------------------------------------------------------------------")
	// bridge.close()

}



const run = async () => {

	console.log(`Starts scheduler instance ${scheduleId} at ${new Date()}`)
	const bridge = await Bridge.create(options)
	
	let mainTask = cron.scheduleJob("*/10 * * * * *", mainExecute(bridge))
	
	
	setTimeout(() => {
		mainTask.cancel()
		bridge.close()
		cron.gracefulShutdown().then(() => {
			console.log(`Terminate scheduler instance ${scheduleId} at ${new Date()}`)
			process.exit(0)
		})
	}, 100000)




}

run()


