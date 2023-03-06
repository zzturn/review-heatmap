# review-heatmap
根据个人notion界面中的review记录生成heatmap

![image](https://user-images.githubusercontent.com/47984356/223133619-8f8cd5fb-c0ec-4d78-98f6-ebc22298a526.png)


1. `index.html` 实现了热力图的前端界面
   
   采用 `echarts` 框架，其中 `pullReviewData` 获取数据来源，需要自定义，返回数据类型为

   ```js
   [["2023-04-15",1],["2023-04-13",1],["2023-04-11",1]]
   ```
   
   随后通过 Github Pages 托管，得到地址为 `https://username.github.io/repo_name/` 的静态页面

2. `app.js` 为自定义获取数据来源，个人用于获取 notion 某个页面中二级标题中出现的日期次数 

   实际场景就是，在 notion 中存储了之前写过的一些东西，标题都是当天日期，所以想用这个热力图来统计一下每天的记录次数

   步骤如下：

    - 按需修改 `.env` 里的配置
    - `node app.js`
    - 修改 [`index.html`](https://github.com/luoxin971/review-heatmap/blob/9b7b8d60d27a4b640e2dcaa294671e0eaecda1b0/index.html#L38) 里的 api 地址
    - 在 notion 中输入 `/embed` 然后输入第一步中的静态网页地址
