const cron = require("node-cron")
const mongo = require('mongodb').MongoClient
const {intersection, difference} = require("lodash")
const moment = require("moment")
const { loadTemplates, getQuery } = require("../query-templates")
const { keys, remove } = require("lodash")
const parser = require('cron-parser')


let client, sourceCollection, commitCollection, scananyCollection

const date = () => moment().format("YYYY-MM-DD HH:mm:ss")

const addMonit = client => {
	const events = [
		"commandStarted",
		"commandSucceeded",
		"commandFailed"
	]	
	events.forEach(eventName => {
		client.on(eventName, event => {
		  console.log(`${date()} MONIT: ${eventName}: ${JSON.stringify(event, null, " ")}`);
		})
	})	
}


const create = async options => {
	
	await loadTemplates("./src/js/query-templates/yaml/*.yml")

	// client = await mongo.connect(options.url, {
	//    useNewUrlParser: true,
	//    useUnifiedTopology: true
	// })

	// let db = client.db(options.db)

	// sourceCollection = db.collection(options.collection.sources)
	// commitCollection = db.collection(options.collection.commits)
	// scananyCollection = db.collection(options.collection.scanany)

	return {
		
		getHeadCommit: async () => {
			let client
			let res
			try {
			
				client = await mongo.connect(options.url, {
				   useNewUrlParser: true,
				   useUnifiedTopology: true,
				   // monitorCommands:true
				})

				// addMonit(client)

				let db = client.db(options.db)

				sourceCollection = db.collection(options.collection.sources)
				commitCollection = db.collection(options.collection.commits)
				scananyCollection = db.collection(options.collection.scanany)


				let query = getQuery("get-head-commit")
				res = await commitCollection.aggregate(query).toArray()
				res = res[0]
			  
			  } catch (e) {
			  
			  	console.log(`${date()}: ERROR: (mb.getHeadCommit) ${e.toString()}`)
			  } finally {
			  
			  	if (client) client.close()
				return res
			  
			  }		

				
		},

		getSources: async commit => {
			
			let client
			let res
			
			try {
			
				client = await mongo.connect(options.url, {
				   useNewUrlParser: true,
				   useUnifiedTopology: true,
				   // monitorCommands:true
				})

				// addMonit(client)

				let db = client.db(options.db)

				sourceCollection = db.collection(options.collection.sources)
				commitCollection = db.collection(options.collection.commits)
				scananyCollection = db.collection(options.collection.scanany)


				let query = getQuery("get-ready-to-start", {commit})
				
				res = await sourceCollection.aggregate(query).toArray()
			
			} catch (e) {
			
			  	console.log(`${date()}: ERROR: (mb.getSources) ${e.toString()}`)
			
			} finally {
			
			  	if (client) client.close()
			  	console.log(`${date()}: INFO: (mb.getSources) Fetch:\n ${(res) ? res.map( d => d.info.name).join("\n")+"\n" : "NO SOURCES"}`)	
				return res
			
			}
		},

		updateSources: async ({commit, sources, instance}) => {

			let client

			try{ 

				client = await mongo.connect(options.url, {
				   useNewUrlParser: true,
				   useUnifiedTopology: true,
				   // monitorCommands:true
				})

				// addMonit(client)

				let db = client.db(options.db)

				sourceCollection = db.collection(options.collection.sources)
				commitCollection = db.collection(options.collection.commits)
				scananyCollection = db.collection(options.collection.scanany)


				for( let i=0; i < sources.length; i++){
					let source = sources[i]
					source.schedule.process.instance = instance
					source.schedule.process.syncAt = new Date()
					// console.log("UPDATE", source.schedule.process)
					let query = getQuery("match-source",{ commit, source })
					let setter = getQuery("set-schedule",{ source })
					await sourceCollection.updateOne(query, setter)
				}
			} catch (e) {
			
			  	console.log(`${date()}: ERROR: (mb.updateSources) ${e.toString()}`)
			
			} finally {
			
			  	if (client) client.close()
			
			}

		},

		validate: sources => {
			
			let valid = []
			let invalid = []	
				
			sources.forEach( d => {

				// console.log("validate", d.info.name, d.schedule)
				if(!d) return				
				
				d.schedule.error = undefined
				
				if(!d.executable){
					d.schedule.process = {
						type: "error",
						message: "Cannot be executed with unknown Scanany script."
					}
					console.log(`${d.info.name} Cannot be executed with unknown Scanany script.`)
					invalid.push(d)
					return	
				}
				
				if( !d.schedule.cron || !cron.validate(d.schedule.cron) ){
					d.schedule.process = {
						type: "error",
						message: "Cannot be executed with invalid cron value."
					}
					console.log(`${d.info.name} Cannot be executed with invalid cron value.`)
					invalid.push(d)
					return
				}
				
				let interval = parser.parseExpression(d.schedule.cron)
				d.schedule.process = {
					type: "success",
					message: "Activated at: " +
								[interval.next(), interval.next(), interval.next()]
									.map( d => moment(new Date(d)).format("YY-MM-DD HH:mm:ss"))
									.join(", ")
				}
				
				valid.push(d)
			
			})
			
			// console.log("invalid:", invalid.map(d => d.info.name).join(", "))
			// console.log("valid:", valid.map(d => d.info.name).join(", "))
			return {
				valid,
				invalid
			}
		},

		close: () => {
			if(client) client.close()
		}
	}

}

module.exports = {
	create
}	
