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

// const run = async () => {
// 	console.log("Test run @molfar/service-schedule")

// 	let config = yaml2js(fs.readFileSync(path.resolve(__dirname, "./service.msapi.yaml")).toString())
// 	config = await resolveRefs(config)

	
// 	const container = new Container()

// 	container.hold(servicePath, "@molfar/schedule")
// 	const service = await container.startInstance(container.getService(s => s.name == "@molfar/schedule"))
// 	let res = await service.configure(config)
// 	console.log("Configure", res)
// 	res = await service.start()
// 	console.log("Start", res)
// 	console.log("Running... 10s")
	
// 	// await delay(1200000) 

// 	// res = await service.stop()
// 	// container.terminateInstance(service)
	
// }


const run = async () => {
	console.log("Test run @molfar/service-schedule")

	let config = yaml2js(fs.readFileSync(path.resolve(__dirname, "./service.msapi.yaml")).toString())
	config = await resolveRefs(config)

	
	const container = new Container()

	container.hold(servicePath, "@molfar/schedule")
	const service = await container.startInstance(container.getService(s => s.name == "@molfar/schedule"))
	
	//--------------- WAIT 5 seconds while service configured 

		let timeout = setTimeout( async () => {
		
			console.log(new Date (),"The service is not responding")
			service.stop()
			await run()
			console.log(new Date (),"Restart service")
		
		}, 5000)
	
	//-------------------------------------------------------


	let res = await service.configure(config)

	//--------------- CLEAR TIMEOUT 

		clearTimeout(timeout)

    //--------------------------------------------------------
	
	console.log(new Date(), "Configure", res)
	res = await service.start()
	console.log(new Date(), "Start", res)
	
	//--------------- IDLE 10 seconds interval for Service hearbeat

		let interval = setInterval( async () => {
			try {
			
				await service.heartbeat()
				console.log(new Date(), "Service heartbeat")
			
			} catch(e) {
			
				console.log(new Date (),"Service error", e.toString())
				clearInterval(interval)
				service.stop()
				await run()
				console.log(new Date (),"Service restart")
			
			}	

		}, 10000)


	//--------------------------------------------------------	

	
}

run()