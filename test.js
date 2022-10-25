const fs = require("fs")
const path = require("path")

const { Container } = require("@molfar/csc")
const { yaml2js, resolveRefs } = require("@molfar/amqp-client")


const servicePath = path.resolve(__dirname, "./service.js")


const delay = interval => new Promise( resolve => {
	setTimeout( () => {
		resolve()
	}, interval )	
}) 

const run = async () => {
	console.log("Test run @molfar/service-schedule")

	let config = yaml2js(fs.readFileSync(path.resolve(__dirname, "./service.msapi.yaml")).toString())
	config = await resolveRefs(config)

	
	const container = new Container()

	container.hold(servicePath, "@molfar/schedule")
	const service = await container.startInstance(container.getService(s => s.name == "@molfar/schedule"))
	let res = await service.configure(config)
	console.log("Configure", res)
	res = await service.start()
	console.log("Start", res)
	console.log("Running... 10s")
	await delay(120000) 

	res = await service.stop()
	container.terminateInstance(service)
	
}

run()