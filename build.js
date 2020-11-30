const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const archiver = require('archiver');

let _originApp
let _app
let _config

function merge(to, from) {
    for (let k in from) {
        let v = from[k]
        if (to instanceof Array && from instanceof Array && k >= to.length) {
            to.push(v)
        } else if (typeof v === 'object') {
            merge(to[k], v)
        } else {
            to[k] = v
        }
    }
}

function getColor(html, mode, tag) {
    // 匹配最后一个配置（允许页面的设置覆盖默认值）
    let matcher = RegExp(`theme\\s*=\\s*"?${mode}.*?${tag}.*?#([0-9a-zA-z]+)`, 'gis')
    let all = html.matchAll(matcher)
    let m
    for (m of all) {
    }

    let c = m ? m[1] : ''
    if (c.length === 3) {
        c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]
    }
    if (c.length === 6) {
        return '#' + c
    }
    return mode === 'dark' ? '#000000' : '#ffffff'
}

function fixAppHtml(html) {
    // 将 onclick 和 addEventListener('click') 替换成 ontouchend
    html = html.replace(/onclick/gi, 'ontouchend')
    html = html.replace(/addEventListener(['"( ]+)click(['"])/gi, 'addEventListener$1touchend$2')
    return html
}

function copyToApp(src) {
    for (let f of fs.readdirSync(src, {withFileTypes: true})) {
        if (f.name.startsWith('.')) continue

        let from = path.join(src, f.name)
        let to = path.join('.appFiles', from.substr(_config.output.length))
        if (f.isFile()) {
            if (f.name.endsWith('.html')) {
                // 处理并复制html文件
                // console.info(from)
                fs.writeFileSync(to, fixAppHtml(fs.readFileSync(from).toString()))
            } else {
                // 复制资源
                fs.copyFileSync(from, to)
            }
        } else if (f.isDirectory()) {
            fs.mkdirSync(to)
            copyToApp(from)
        }
    }
}

module.exports = {
    onMake: (file, html) => {
        // 处理 app view
        html = html.replace(/\{\{APP_NAME}}/g, _app.name)
        html = html.replace(/\{\{APP_VERSION}}/g, _app.version)

        // 提取背景颜色
        let name = file.substr(_config.output.length, file.length - _config.output.length - 5)
        if (!_app.views[name]) _app.views[name] = {}

        // 采集背景颜色用于加载时预先设置背景
        if (!_originApp.views[name] || _originApp.views[name].lightBackground === undefined) _app.views[name].lightBackground = getColor(html, 'light', '--bgColor')
        if (!_originApp.views[name] || _originApp.views[name].darkBackground === undefined) _app.views[name].darkBackground = getColor(html, 'dark', '--bgColor')

        // 采集 tintColor 和 dimColor 便于 App 显示icon颜色
        if (!_originApp.views[name] || _originApp.views[name].lightTintColor === undefined) _app.views[name].lightTintColor = getColor(html, 'light', '--tintColor')
        if (!_originApp.views[name] || _originApp.views[name].darkTintColor === undefined) _app.views[name].darkTintColor = getColor(html, 'dark', '--tintColor')
        // if (!_originApp.views[name] || _originApp.views[name].lightDimColor === undefined) _app.views[name].lightDimColor = getColor(html, 'light', '--dimColor')
        // if (!_originApp.views[name] || _originApp.views[name].darkDimColor === undefined) _app.views[name].darkDimColor = getColor(html, 'dark', '--dimColor')

        if (!_originApp.views[name] || _originApp.views[name].showNavBar === undefined) _app.views[name].showNavBar = /class\s*=\s*".*?TopNavBar.*?"/i.test(html)
        if (!_originApp.views[name] || _originApp.views[name].fullScreen === undefined) _app.views[name].fullScreen = false

        // dev模式下创建 index.html 的缓存，用于局部变动后注入index.html
        if (_config.mode === 'dev' && name === 'index') {
            fs.writeFileSync('.dev.index.html', html)
        }

        return html
    },

    onBuildStart: (config) => {
        _config = config
        // 载入app配置
        _app = yaml.safeLoad(fs.readFileSync(path.join('src', 'app.yml')))
        if (fs.existsSync(path.join('src', 'env.yml'))) {
            // 载入环境配置
            let env = yaml.safeLoad(fs.readFileSync(path.join('src', 'env.yml')))
            merge(_app, env)
        }
        if (!_app.modules) _app.modules = {}
        if (!_app.views) _app.views = {}
        _originApp = JSON.parse(JSON.stringify(_app))
    },

    onBuildEnd: () => {
        // 将打包好的内容复制一份用于打包app
        if (fs.existsSync('.appFiles')) fs.rmSync('.appFiles', {recursive: true})
        fs.mkdirSync('.appFiles')
        copyToApp(_config.output)

        // 写入 app.json
        fs.writeFileSync(path.join('.appFiles', 'app.json'), JSON.stringify(_app))

        // 打包 app
        if (fs.existsSync('app')) fs.rmSync('app', {recursive: true})
        fs.mkdirSync('app')
        let appPackage = fs.createWriteStream('app/app.package');
        let archive = archiver('zip')
        archive.on('error', e => {
            console.error(e)
            if (fs.existsSync('.appFiles')) fs.rmSync('.appFiles', {recursive: true})
        })
        archive.on('end', e => {
            // 清除 app 临时文件
            if (fs.existsSync('.appFiles')) fs.rmSync('.appFiles', {recursive: true})
        })
        archive.pipe(appPackage)
        // archive.bulk([{src: ['.appFiles/**']}])
        archive.directory('.appFiles/', false)
        archive.finalize()

        // 写入 app.version
        fs.writeFileSync(path.join('app', 'app.version'), _app.version)

        // 注入 index.html
        // let icons = {}
        // for (let mod of _app.modules) {
        //     let svgFile = path.join(_config.output, 'icon', mod.view + '.svg')
        //     if (fs.existsSync(svgFile)) {
        //         let svgData = fs.readFileSync(svgFile).toString().replace(/^.*?<svg/is, '<svg')
        //         icons[mod.view] = svgData
        //     }
        // }
        let indexFile = path.join(_config.output, 'index.html')
        let indexHtml = fs.readFileSync('.dev.index.html').toString()
        indexHtml = indexHtml.replace('{{APP_CONFIG}}', JSON.stringify(_app))
        // indexHtml = indexHtml.replace('{{APP_ICONS}}', JSON.stringify(icons).replace(/\\/g, '\\\\').replace(/'/g, "\\'"))
        fs.writeFileSync(indexFile, indexHtml)
    },

    onExit: () => {
        // 清除 .dev.index.html
        if (fs.existsSync('.dev.index.html')) fs.unlinkSync('.dev.index.html')
    },

}
