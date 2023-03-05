const {Client} = require("@notionhq/client")
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');

/**
 * 本项目主要为了配合获取 notion page 中二级标题以 yyyy-mm-dd 开头为格式的出现次数，用于热力图的生成
 *
 * /get 获取统计数据，暂时无法判断 block 删除的情况
 * /refresh 获取统计数据，并刷新缓存
 *
 */


// Load environment variables from .env file
dotenv.config();


const app = express();
app.use(cors());


// Define a custom log format
const logFormat = ':date[iso] :remote-addr :method :url :status :response-time ms';
// Use the custom log format with morgan middleware
app.use(morgan(logFormat));



const hostname = process.env.SERVER_HOST;
const port = process.env.SERVER_PORT;
const notion_token = process.env.NOTION_TOKEN;
const review_page_id = process.env.PAGE_ID;


// 缓存所有的block结果
let blocksCache = undefined;
// 缓存最近更新时间
let lastEditTimeMapCache = new Map();

// Define a route to handle requests
app.get('/get', async (req, res) => {
    try {
        let map = await getHeading2FromBlock(review_page_id);
        res.status(200).header('Content-Type', 'application/json').send(map);
    } catch (error) {
        console.log(error)
        res.status(500).send(JSON.stringify(error))
    }
});

// 刷新缓存
app.get('/refresh', async (req, res) => {
    try {
        blocksCache = await getAllChildren(review_page_id);
        let map = getHeading2(blocksCache);
        lastEditTimeMapCache = getLastEditMap(blocksCache);
        res.status(200).header('Content-Type', 'application/json').send(Array.from(map));
    } catch (error) {
        console.log(error)
        res.status(500).send(JSON.stringify(error))
    }
});

// 监听端口
app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

// Initializing a notion client
const notion = new Client({
    auth: notion_token,
})

const getHeading2FromBlock = async (parentBlockId) => {
    let map;
    if (!blocksCache) {
        console.log("无缓存")
        console.log("begin", new Date())
        blocksCache = await getAllChildren(parentBlockId);
        console.log("end", new Date())
    } else {
        console.log("有缓存")
        let new_blocks = await getNewBlocks(parentBlockId)
        let new_block_ids = new_blocks.map(x => x.id);
        console.log("新增/修改 block:", JSON.stringify(new_block_ids))
        // 更新block缓存
        let old_blocks = blocksCache.filter(x => !new_block_ids.includes(x.id))
        blocksCache = [...new_blocks, ...old_blocks]
    }
    // 更新时间缓存
    lastEditTimeMapCache = getLastEditMap(blocksCache);
    map = getHeading2(blocksCache);

    return Array.from(map);
}

// 遍历一级节点里的新节点，用户后续更新缓存
const getNewBlocks = async (block_id) => {
    const page_size = 10
    let cursor = undefined
    let has_more = true
    let first_block_ids = []
    let all_new_blocks = []

    while (has_more === true) {
        // 获取子节点
        console.log("begin", new Date())
        let res = await notion.blocks.children.list({block_id: block_id, page_size: page_size, start_cursor: cursor})
        // 过滤出新 block
        let new_blocks = res.results.filter(x => lastEditTimeMapCache.get(x.id) == undefined || new Date(x.last_edited_time) > lastEditTimeMapCache.get(x.id));
        let new_blocks_with_children = await Promise.all(new_blocks.map(async x => {
            if (x.has_children) {
                let children = await getAllChildren(x.id);
                x.children = children;
            }
            return x;
        }))
        console.log(new_blocks_with_children)


        if (new_blocks_with_children.length > 0) {
            has_more = true
        } else {
            has_more = false
        }
        all_new_blocks = [...all_new_blocks, ...new_blocks_with_children];
        cursor = res.next_cursor
    }
    return all_new_blocks
}


// 获取 block_id 下的所有 children
async function getAllChildren(block_id) {
    const page_size = 100
    // 所有的一级 block
    let child_blocks = []
    let has_more = true
    let cursor = undefined
    while (has_more === true) {
        // 获取子节点
        let res = await notion.blocks.children.list({block_id: block_id, page_size: page_size, start_cursor: cursor})
        child_blocks = child_blocks.concat(res.results)
        // 获取子节点的子节点
        for (let block of res.results) {
            if (block.has_children) {
                let children = await getAllChildren(block.id)
                block.children = children
            }
        }
        has_more = res.has_more
        cursor = res.next_cursor
    }
    return child_blocks
}

// 获取blocks中所有的内容为日期的二级标题，return Map<date, count>
function getHeading2(blocks) {

    let map = new Map()
    for (let block of blocks) {
        // 默认在二级标题下不会再出现二级标题
        if (block.heading_2) {
            let datestr = isDateString(block.heading_2.rich_text[0]?.plain_text)
            if (datestr) {
                map.set(datestr, (map.get(datestr) ? map.get(datestr) : 0) + 1)
            }
        } else if (block.has_children) {
            let subChildren = getHeading2(block.children)
            for (let [str, num] of subChildren) {
                if (map.get(str)) {
                    map.set(str, map.get(str) + num)
                } else {
                    map.set(str, num)
                }
            }
        }
    }
    return map
}

// 获取最近更新时间 Map<id, lastEditTime>
function getLastEditMap(blocks) {
    let map = new Map();
    for (let block of blocks) {
        map.set(block.id, new Date(block.last_edited_time))
    }
    return map;
}

// 合并两个map，要求两个map的value都是number类型
function mergeMaps(map1, map2) {
    for (let [key, value] of map2) {
        if (map1.get(key)) {
            map1.set(key, map1.get(key) + value)
        } else {
            map1.set(key, value)
        }
    }
    return map1
}

// 是否满足 yyyy-mm-dd 的格式
function isDateString(str) {
    const pattern = /^20\d{2}-[01][0-9]-[0-3][0-9]/
    let match = pattern.exec(str)
    if (match) {
        return match[0]
    } else {
        return null;
    }
}
