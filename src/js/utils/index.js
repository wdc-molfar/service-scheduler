const { isUndefined, isNull, isArray, get} = require("lodash")
// const pattern = [
// 	"info.name",
// 	"info.description",
// 	"info.labels.ids",
// 	'schedule.interval',                                                                                                 
// //   	'schedule.startedAt',
//   	'scanany.script',                                                                                                    
//   	'scanany.params'  
// ]

const equals = (o1,o2,pattern) => pattern.reduce( (f, p) => {
    let v1 = get(o1,p)
	let v2 = get(o2,p)
	if( isUndefined(v1) && isUndefined(v2)) return f && true
	if( isNull(v1) && isNull(v2)) return f && true
	
	if( (isUndefined(v1) && v2) || (isUndefined(v2) && v1)) return f && false
	if( (isNull(v1) && v2) || (isNull(v2) && v1)) return f && false
	
	if( v1.prototype != v2.prototype) return f && false
	
	if( isArray(v1)){
		let res = v1.reduce( (f,v) => {
			return f && v2.includes(v)
		}, true)
		return f && res
	} else {
		return f && v1 == v2
	}
}, true)


module.exports = {
	equals
}