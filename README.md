![封面图](img/封面图.png)

# 解决 Clash 分流失控：让 ChatGPT / Claude 稳定走指定家宽出口

凌晨两点，你打开 ChatGPT，风控页面跳出来；切到 Claude，Cloudflare 验证卡住；回头查机场，节点全绿、延迟正常。看着像机场掉链子，真翻日志才发现：`api.openai.com` 的 DNS 解析跑到了境内 DoH，出口 IP 根本不是你以为的那个地区。

这是 Clash 用户最熟悉的困扰——**表面能用，但出口经常不对**。

规则看着是对的，DNS 偷偷走岔；换了台机器，某个进程的可执行名变了，分流就静默失效；给 AI 流量接了家宽 IP，结果只有一半请求走上去，剩下一半仍然从机场 IP 出。登录异常、风控、速度波动，每一次都要重新排查"到底卡在哪层"。

这个仓库就是为这一层问题做的：**让关键流量稳定命中你指定的家宽出口，不再"偶尔对、偶尔错"**。

如果你在这些症状里认出自己，继续往下看。

> 当前主脚本版本：`v9.0`

## 它做的事情

简单说三类流量，三个去向：

**AI 与开发相关**走 `chainRegion` 对应的链式家宽出口。ChatGPT、Claude、Gemini、Perplexity 的主站和 API，加上 Google、Microsoft、GitHub 这些登录和支撑平台，全部收口到一跳家宽 + 一跳机场节点的链式代理。受管的浏览器（Chrome / Dia / Atlas / SunBrowser）和 `claude` / `codex` 这些 CLI 进程也按进程名强制绑定到这条链路，避免 AI 站点从浏览器或 CLI 出去时走岔。

**社交与流媒体**走 `mediaRegion` 对应的普通地区组。YouTube、Netflix、X、Telegram、Discord 这类不需要家宽 IP，单独走一个干净的 url-test 组，不占家宽链路。

**域内与特定应用**固定 `DIRECT`。腾讯、阿里、字节、WPS 的办公协作走境内 DoH 直连；Tailscale、Typeless 这类域外应用也直连，但配套域外 DoH + skip-domain，避免境内 DNS 污染。还有网络地址本身的 IP-CIDR 直连。

脚本同时接管了 DNS `nameserver-policy`、Sniffer 的 `force-domain` / `skip-domain`、`fake-ip-filter` 白名单——**让这四层用同一套分类**，而不是规则对、DNS 错、Sniffer 又是另一套。这是"表面规则正确但出口不对"问题的根源。

## 分流一览

### 1. `chainRegion`——最需要收紧的一组

目标明确：AI 相关的每一次请求，都必须从你指定的家宽 IP 出去。

覆盖三层：**域名**（Claude / ChatGPT / Gemini / NotebookLM / Perplexity 主站和 API，加 Google / Microsoft / GitHub 登录与下载）、**进程名**（Claude.app / ChatGPT.app / Perplexity.app / Cursor 及各自的 Electron Helper）、**CLI 可执行名**（`claude` 统一覆盖 Claude Code CLI 与 URL Handler，因为两者共用同一份二进制；加上 `codex` 和 `gemini`）。

受管浏览器之所以单独列一份，是因为 AI 站点大部分从浏览器访问。如果浏览器出去走的是机场 IP，域名级规则再严也拦不住——因为进程已经把握手完成了。

### 2. `mediaRegion`——媒体独立选区

媒体流量和 `chainRegion` 脱钩。单独切 `mediaRegion` 只影响 YouTube / Netflix / X / Facebook / Instagram / Telegram / Discord 这一类，不会动到 AI 出口。

为什么分开：家宽 IP 通常速度不如机场节点，也没必要为看剧牺牲带宽。媒体走普通地区组既能拿到地区解锁又保留速度。

### 3. `DIRECT`——必须稳的一组

国内办公协作（腾讯、阿里、字节、WPS）走境内 DoH 直连——避免域外 DoH 把这些站点解析成远端 IP、反而变慢。Apple 走境内 DoH + fake-ip 绕过，因为 iCloud 推送对真实 IP 敏感。

Tailscale、Typeless 这类域外应用走 `DIRECT + 域外 DoH + skip-domain`——它们不适合走链式代理（会破坏 P2P 打洞），也不能用境内 DoH（会被解析错），所以固定这一组合。

网络地址层面，Tailscale 的 CGNAT 网段（`100.64.0.0/10`）、魔法 DNS（`100.100.100.100`）、IPv6 ULA（`fd7a:115c:a1e0::/48`）也走 IP-CIDR 直连。

## 快速开始

### 1. 准备代理和家宽资源

两类资源：

- 一个代理订阅
- 一个家宽 IP 服务，用作链式出口

已有自己的资源直接替换。示例：
- 代理订阅示例：[办公娱乐好帮手](https://xn--9kq10e0y7h.site/index.html?register=twb6RIec)
- 家宽资源示例：[MiyaIP](https://www.miyaip.com/?invitecode=7670643)

### 2. 准备两份覆写脚本

- [`MiyaIP 凭证.js`](src/MiyaIP%20%E5%87%AD%E8%AF%81.js)——向 `config._miya` 注入凭证。
- [`家宽IP-链式代理.js`](src/%E5%AE%B6%E5%AE%BDIP-%E9%93%BE%E5%BC%8F%E4%BB%A3%E7%90%86.js)——生成链式节点、媒体组、分流规则。

### 3. 填好凭证脚本

新建 `MiyaIP 凭证.js`，把真实信息填进去：

```javascript
function main(config) {
  config._miya = {
    username: "你的用户名",
    password: "你的密码",
    relay: {
      server: "12.34.56.78",
      port: 8022
    },
    transit: {
      server: "transit.example.com",
      port: 8001
    }
  };
  return config;
}
```

### 4. 按顺序导入覆写

在 `Clash Party` 里按这个顺序导入：

1. `MiyaIP 凭证.js`
2. `家宽IP-链式代理.js`

顺序不能反——主脚本运行时会直接读 `config._miya`，凭证脚本排在后面会导致启动即报错。

![Clash Party 覆写页面](img/Clash%20Party%20覆写.jpg)

### 5. 按场景调整参数

多数情况下只需要改这四个入口参数：

```javascript
var USER_OPTIONS = {
  chainRegion: "SG",
  mediaRegion: "US",
  enableChainRegionBrowserProcessProxy: true,
  enableChainRegionAiCliProcessProxy: true
};
```

- ChatGPT 看起来在美国：`chainRegion: "US"`
- Claude 看起来在日本：`chainRegion: "JP"`
- 刷 Netflix 美区：`mediaRegion: "US"`
- AI 用日本、媒体用美国：`chainRegion: "JP"`，`mediaRegion: "US"`
- 不想让浏览器按进程名强制走 `chainRegion`：`enableChainRegionBrowserProcessProxy: false`
- 不想让 AI CLI 按可执行名强制走 `chainRegion`：`enableChainRegionAiCliProcessProxy: false`

### 6. 启用并确认结果

启用两个覆写 → 切到机场配置 → 启动代理 → 确认规则模式 + TUN 模式已开。

默认配置下如果订阅里有 `节点选择` 组，你会看到：

- `🇸🇬|新加坡-链式代理.跳板`（当前 `chainRegion` 对应的跳板）
- `🇺🇸|美国-媒体`（当前 `mediaRegion` 对应的媒体组）

加上新生成的 `🇸🇬|新加坡-链式代理.家宽IP出口`（家宽出口组）。

地区名不是写死的——改 `chainRegion: "HK"`、保持 `mediaRegion: "US"`，下次加载会自动变成 `🇭🇰|香港-链式代理-跳板` 和 `🇺🇸|美国-媒体`。

日常使用时，在 `节点选择` 里手动选中当前地区对应的跳板组；媒体流量由规则直接命中 `-媒体` 组，不用手选。

![Clash Party 代理组页面](img/Clash%20Party%20代理组.jpg)

## 你是不是它的用户

**适合你，如果**——经常用域外 AI 服务、对代理稳定性敏感、已经在用 Clash 或 Clash Party、愿意导入两份脚本但不想手写规则。

**不适合你，如果**——只想一键全局代理不关心地区、没有家宽 IP 资源也没打算租一个、不使用 Clash Party。

## 本地校验

改完规则之后，先跑一遍：

```bash
node tests/validate.js
```

## 常见问题

- **报错与启动**

	- **缺少 `config._miya`**——覆写导入顺序反了。`MiyaIP 凭证.js` 必须排在主脚本前面，且文件里已经写入真实凭证。
	- **找不到可用地区跳板 / 媒体节点**——当前 `chainRegion` / `mediaRegion` 没有在订阅中命中任何节点。确认订阅包含该地区，并检查节点命名能否被地区正则识别（见 `BASE.regions`）。

- **生成结果不符合预期**

	- **`节点选择` 里没有 `-链式代理-跳板` 或 `-媒体` 组**——脚本只把当前地区对应的组同步到 *已存在的* `节点选择`；订阅里若无该组，脚本不会新建。
	- **出口地区不对**——按顺序排查：凭证与中转端点 → 当前地区的家宽出口组、跳板组、媒体组是否生成 → dialer-proxy 绑定是否到位。偏差多在这几层。

- **设计选择**

	- **为什么域外应用保留直连**——Tailscale、Typeless 这类本就不适合走家宽链式代理，但境内 DoH 解析它们不稳定，所以固定成 `DIRECT + 域外 DoH + skip-domain`。

## 兼容性

- 运行环境：`Clash Party` 的 `JavaScriptCore`
- 语法范围：`ES5`
- 进程分流覆盖：当前只维护 `macOS` 常见命名
