const glob = require("fast-glob")
const path = require("path")
const extend = require("deep-extend")
const fs = require("fs")
const { yaml2js } = require("@molfar/service-chassis")
const { get, keys, isObject, isArray } = require("lodash")

const getFileList = async ( pattern, options ) => {
    let res = await glob(pattern, options)
    return res.map( d => path.resolve(d))
}     


let template



const loadTemplates = async pattern => {
	template = {}
	filelist = await getFileList(pattern)
	filelist.forEach( f => {
		let content = yaml2js(fs.readFileSync(f).toString())
		template[content.name] = content.template
	})
	console.log("Load Query Templates:\n"+keys(template).join("\n"))

}	 


const resolve = (obj, options) => {
	
	options = options || {}
	if(obj.$ref){
		obj = get(options, obj.$ref)
		return obj
	}

	if(isArray(obj)){
		return obj.map( item => resolve(item, options))
	}

	if(isObject(obj)){
		keys(obj).forEach( key => {
			obj[key] = resolve(obj[key], options)
		})
		return obj
	}

	return obj

}



const getTemplate = (name, options) => {
	if(!template) return
	let query
	if(isArray(template[name])){
		query = template[name].map( d => d)
	} else if(isObject(template[name])){
		query = extend({},template[name])
	}	
	return resolve( query, options )	
}

module.exports = {
	loadTemplates,
	getTemplate,
	getQuery: getTemplate
}	