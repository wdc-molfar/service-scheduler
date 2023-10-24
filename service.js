 const { ServiceWrapper, AmqpManager, Middlewares } = require("@molfar/service-chassis")
 const schedule = require("./src/js/schedule")
 let service = new ServiceWrapper({
 	
 	config: null,
 	

    //-------------- Add heartbeat exported method

         async onHeartbeat(data, resolve){
            resolve({})
        },
 
    //--------------------------------------------



 	async onConfigure(config, resolve){
 		
 		this.config = config

 		this.config.publisher = await AmqpManager.createPublisher(this.config.service.produce)
        
        await this.config.publisher.use([
            Middlewares.Schema.validator(this.config.service.produce.message),
            Middlewares.Error.Log,
            Middlewares.Error.BreakChain,
            Middlewares.Json.stringify
        ])


 		await schedule.configure(config)
		resolve({status: "configured"})
	
 	},

	async onStart(data, resolve){
		
		schedule.start()
		// schedulethis.monitor = await createMonitor (this.config._instance_id, this.config.service.monitoring)
  		// this.monitor.start()
		resolve({status: "started"})	
 	
 	},

 	async onStop(data, resolve){
		
		await schedule.stop()
		await this.config.publisher.close()

		resolve({status: "stoped"})
	
	}

 })
 
 
 service.start()

