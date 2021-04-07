let _nativeCallbacks = {}
let _nativeNoticeCallback = null
let _loaded = false
let _loadingData = null
let _baseUrl = '/'

function postMessage(target, data) {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[target] && window.webkit.messageHandlers[target].postMessage) {
        window.webkit.messageHandlers[target].postMessage(data)
    } else if (window.parent) {
        window.parent.postMessage({target, data})
        // window.parent.postMessage({target, data}, '*')
    }
}

window.$all = (id, callback, from) => {
    if (!from) from = document.body
    if (typeof from === 'string') from = $(from)
    if (callback) {
        for (let node of from.querySelectorAll(id)) {
            callback(node)
        }
    } else {
        return from.querySelectorAll(id)
    }
}

window.$ = (id, from) => {
    if (!id) return document.body
    if (typeof id !== 'string') return id
    if (!from) from = document.body
    if (typeof from === 'string') from = $(from)
    return from.querySelector(id)
}

window.$clear = (node) => {
    if (typeof node === 'string') node = $(node)
    while (node.childNodes.length) node.removeChild(node.childNodes[0])
}

Array.getBy = function(arr, field, value){
    for (let index in arr) {
        if (arr[index][field] === value) {
            return arr[index]
        }
    }
    return null
}

Array.removeBy = function(arr, field, value){
    for (let index in arr) {
        if (arr[index][field] === value) {
            arr.splice(index, 1)
            return
        }
    }
}

let responder = r => {
    console.error('no responder', r)
}

function request(method, path, data, timeout) {
    let url
    if (path.startsWith('/')) {
        if (_baseUrl.indexOf('://') === -1) {
            url = path
        } else {
            url = _baseUrl.replace(/:\/\/(.*?)\/.*$/, '://$1' + path)
        }
    } else {
        url = _baseUrl + path
    }

    if (!timeout) timeout = 3000
    let ac = new AbortController()
    let option = {
        signal: ac.signal,
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Device-Id': device.id,
            'Session-Id': sessionStorage[device.id + '-Session-Id'] || '',
            'App-Name': '{{APP_NAME}}',
            'App-Version': '{{APP_VERSION}}',
        },
    }
    if (data) {
        option.body = JSON.stringify(data)
        option.headers['Content-Length'] = option.body.length
    }

    let timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
            reject('timeout')
            ac.abort()
        }, timeout)
    })
    let requestPromise = fetch(url, option).then(r => {
        if (r.headers.get('Session-Id')) {
            sessionStorage[device.id + '-Session-Id'] = r.headers.get('Session-Id')
        }
        return r.json()
    })

    // 成功才会调用 resolve, 其他情况一律交给 responder 处理
    return new Promise(resolve => {
        Promise.race([timeoutPromise, requestPromise]).then(r => {
            if (!r) {
                responder({ok: false, message: '', argot: 'HintBadNetwork'})
            } else if (!r.ok) {
                responder(r)
            } else {
                resolve(r)
            }
        }).catch(e => {
            responder({ok: false, message: e.toString(), argot: 'HintBadNetwork'})
        })
    })

    // return Promise.race([timeoutPromise, requestPromise])
}

window.setResponder = (cb) => {
    responder = cb
}

window.ws = (url) => {
    // return request('GET', url)
}

window.get = (path, timeout) => {
    return request('GET', path, null, timeout)
}

window.post = (path, data, timeout) => {
    return request('POST', path, data, timeout)
}

window.put = (path, data, timeout) => {
    return request('PUT', path, data, timeout)
}

window.Data = class {
    constructor(path) {
        this.path = path
        // indexedDB.open(path)
        // TODO 支持本地数据存储（自动从服务器同步）
    }

    load() {
        return new Promise(resolve => {
            resolve()
        })
    }

    sync(callback) {
        // get(this.path)
        return new Promise(resolve => {
            resolve()
        })
    }
}

window.load = k => {
    return localStorage[device.id + '-' + k]
}

window.save = (k, v) => {
    return localStorage[device.id + '-' + k] = v
}

window.app = {
    onShow: (data) => {
        if (window.onShow && _loaded) {
            window.onShow(data)
        } else {
            _loadingData = data
        }
    },

    onHide: () => {
        if (window.onHide) {
            window.onHide()
        }
    },

    nav: {
        showMaster: (name) => {
            postMessage('nav', {type: 'master', name})
        },

        showDetail: (name, args) => {
            postMessage('nav', {type: 'detail', name, args})
        },

        to: (name, args) => {
            postMessage('nav', {type: 'to', name, args})
        },

        push: (name, args) => {
            postMessage('nav', {type: 'push', name, args})
        },

        back: () => {
            postMessage('nav', {type: 'back', name: 'up'})
        },

        backToTop: () => {
            postMessage('nav', {type: 'back', name: 'top'})
        },
    },

    native: {
        call: (action, data, callback) => {
            let callbackId = null
            if (callback) {
                callbackId = new Date().getTime() + '_' + Math.ceil(Math.random() * 1000000)
                _nativeCallbacks[callbackId] = callback
            }
            postMessage('native', {action, data, callbackId})
        },

        callback: (callbackId, data) => {
            if (!_nativeCallbacks[callbackId]) return
            try {
                let dataObject = JSON.parse(data)
                _nativeCallbacks[callbackId](dataObject)
            } catch (e) {
                _nativeCallbacks[callbackId]()
            }
            delete _nativeCallbacks[callbackId]
        },

        notice: (data) => {
            if (!_nativeNoticeCallback) return
            try {
                let dataObject = JSON.parse(data)
                _nativeNoticeCallback(dataObject.type, dataObject.data)
            } catch (e) {
            }
        },

        setNoticeCallback: (callback) => {
            _nativeNoticeCallback = callback
        },

    },

    log: {
        info: (...args) => {
            window.app.log.print('INFO', args)
        },

        warn: (...args) => {
            window.app.log.print('WARNING', args)
        },

        error: (...args) => {
            window.app.log.print('ERROR', args)
        },

        print: (type, args) => {
            args.unshift(type)
            window.app.native.call('print', args)

        },
    },

    // list: (data, option) => {
    //     if (option) {
    //         // 把选项追加到数据
    //         for (let i in data) {
    //             for (let k in option) {
    //                 if (!data[i][k]) {
    //                     data[i][k] = option[k]
    //                 }
    //             }
    //
    //             // 确保有高度数据
    //             if (!data[i].height) data[i].height = 44
    //         }
    //     }
    //
    //     if (device.inApp) {
    //         // 通知 App 渲染列表数据
    //         init.native.call('showList', data)
    //     } else {
    //         // 用模版方法渲染数据
    //         window.tpl($(), {list: data})
    //     }
    // },
}

// window.fixSvg = nodes => {
//     for (let svg of nodes) {
//         for (let i = svg.childNodes.length - 1; i >= 0; i--) {
//             if (svg.childNodes[i].nodeName === 'PATH') {
//                 let newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
//                 newPath.setAttribute('d', svg.childNodes[i].getAttribute('d'))
//                 svg.appendChild(newPath)
//             }
//             if (svg.childNodes[i].nodeName !== '#comment') svg.removeChild(svg.childNodes[i])
//         }
//     }
// }

let _svgCaches = {}

function convertSvgNode(to, from) {
    for (let node of from.childNodes) {
        if (node.nodeType === 1) {
            // console.log(node.nodeName)
            let newNode = document.createElementNS('http://www.w3.org/2000/svg', node.nodeName.toLocaleLowerCase())
            for (let attr of node.attributes) {
                newNode.setAttribute(attr.name, attr.value)
            }

            if (node.nodeName === 'TEXT') {
                newNode.textContent = node.innerHTML
            }

            to.appendChild(newNode);

            if (node.childNodes.length) {
                convertSvgNode(newNode, node)
            }
        }
    }
}

function makeSvg(node, data) {
    let div = document.createElement('div')
    div.innerHTML = data
    let svg = div.childNodes[0]
    $clear(node)

    for (let attr of svg.attributes) {
        if (!node.getAttribute('_' + attr.name)) node.setAttribute(attr.name, attr.value)
    }

    convertSvgNode(node, svg)
}

// 修复 svg
window.fixSvg = dom => {
    $all('svg[src]', node => {
        let src = node.getAttribute('src')
        if (src && node.getAttribute('_loadedSrc') !== src) {
            for (let attr of node.attributes) {
                if (attr.name.startsWith('_')) continue
                if (!node.getAttribute('_' + attr.name)) node.setAttribute('_' + attr.name, attr.value)
            }

            let svgCache = _svgCaches[src]
            if (!svgCache) {
                // 获取svg数据
                fetch(src).then(r => r.text()).then(svgData => {
                    let m = svgData.match(/<svg.*?>.*?<\/svg>/is)
                    if (m) {
                        m[0] = m[0].replace(/<(\w+)([^<]+?)\/>/g, '<$1$2></$1>')
                        _svgCaches[src] = m[0]
                        makeSvg(node, m[0])
                    }
                    node.setAttribute('_loadedSrc', src)
                }).catch(e => {
                    console.error(e)
                })
            } else {
                // 从缓存创建
                makeSvg(node, svgCache)
                node.setAttribute('_loadedSrc', src)
            }
        }
    }, dom)
}

window.setOption = ({safeArea, navType, isPushChild}) => {
    if (safeArea) {
        let a = safeArea.split(',')
        if (!a[0]) a[0] = '0'
        if (a.length === 1) a.push('0')
        if (a.length === 2) a.push('0')
        if (a.length === 3) a.push('0')
        document.documentElement.style.setProperty('--safeAreaTop', a[0]);
        document.documentElement.style.setProperty('--safeAreaBottom', a[1]);
        document.documentElement.style.setProperty('--safeAreaLeft', a[2]);
        document.documentElement.style.setProperty('--safeAreaRight', a[3]);
    }
    // console.info(device, isPushChild)
    document.documentElement.setAttribute('isPushChild', isPushChild === 'true' || isPushChild === true ? 'true' : 'false')
    document.documentElement.setAttribute('navType', navType)
}

window.setBaseUrl = (baseUrl) => {
    _baseUrl = baseUrl
    if (!_baseUrl.endsWith('/')) _baseUrl += '/'
}

let appArgs = window.appArgs || location.hash
if (!appArgs) {
    appArgs = '#safeArea=0,0,0,0&theme=&deviceId=&deviceType=&deviceInApp=&isPushChild=&args='
}

let appParms = new URLSearchParams('?' + appArgs.substr(1))

if (appParms.has('baseUrl')) {
    setBaseUrl(appParms.get('baseUrl'))
}

if (appParms.has('args') && appParms.get('args')) {
    try {
        _loadingData = JSON.parse(decodeURIComponent(appParms.get('args')))
    } catch (e) {
        console.error(e)
    }
}

window.device = {
    id: appParms.get('deviceId') || localStorage.deviceId,
    type: appParms.get('deviceType'),
    theme: appParms.get('theme') || (window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'),
    inApp: appParms.get('deviceInApp') === 'true',
}

if (!device.id) {
    localStorage.deviceId = 'DEV-' + Math.ceil(Math.random() * 100000000)
    device.id = localStorage.deviceId
}

if (!device.type) {
    if (navigator.userAgent.indexOf('iPad') !== -1) device.type = 'pad'
    else if (navigator.userAgent.indexOf('iPod') !== -1 || navigator.userAgent.indexOf('iPhone') !== -1) device.type = 'phone'
    else if (navigator.userAgent.toLocaleLowerCase().indexOf('tablet') !== -1) device.type = 'pad'
    else if (navigator.userAgent.indexOf('Android') !== -1 && window.innerWidth < 720 && window.innerHeight < 1024) device.type = 'phone'
    else if (navigator.userAgent.indexOf('Android') !== -1) device.type = 'pad'
    else if (window.innerWidth < 720 && window.innerHeight < 1024) device.type = 'phone'
    else device.type = 'pc'
}

document.documentElement.setAttribute('theme', device.theme)
document.documentElement.setAttribute('deviceType', device.type)

if (device.inApp) {
    console.log = app.log.info
    console.info = app.log.info
    console.warn = app.log.warn
    console.error = app.log.error
}

setOption({
    safeArea: appParms.get('safeArea') || '0,0,0,0',
    isPushChild: appParms.get('isPushChild'),
    navType: appParms.get('navType') || 'to',
})

// 解决滚动触发ontouchend
let lockTouchMove = false
if (device.inApp) {
    function tmpTouchEnd(e) {
        e.stopPropagation()
        window.removeEventListener('touchend', tmpTouchEnd, true)
        lockTouchMove = false
    }

    window.addEventListener('touchmove', () => {
        if (lockTouchMove) return
        lockTouchMove = true
        window.addEventListener('touchend', tmpTouchEnd, true)
    }, true)
}

window.addEventListener('load', () => {
    _loaded = true
    fixSvg()

    // 非App中加载时触发onShow
    if (!device.inApp && window.onShow) {
        window.onShow(_loadingData)
    }
})
