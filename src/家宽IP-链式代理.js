/**
 * Clash 家宽IP-链式代理 覆写脚本（整合 DNS + Sniffer）
 *
 * 功能：
 * 1) 注入 MiyaIP 链式代理节点（自选跳板 + 官方中转）
 * 2) 覆写 DNS 与域名嗅探策略
 * 3) 注入 AI / 开发者域名规则，置顶于订阅规则之前
 * 4) 流媒体区域锁定（YouTube / Netflix / X 等锁定到指定地区最快节点）
 *
 * 依赖：MiyaIP 凭证.js（必须在本脚本之前执行，注入 config._miya）
 *
 * 兼容性：本脚本运行在 Clash Party 的 JavaScriptCore 环境中，
 *         不支持箭头函数、解构赋值、模板字符串、展开语法、
 *         Object.values()、Object.fromEntries() 等 ES6+ 特性。
 *         全部使用 ES5 语法编写。
 *
 * @version 7.6
 */

// ---------------------------------------------------------------------------
// 用户可调参数
// ---------------------------------------------------------------------------

var USER_OPTIONS = {
  // 链式代理中转地区：US / JP / HK / SG（主要用于域外 AI 服务）
  chainRegion: "SG",
  // 流媒体与域外社交锁区：US / JP / HK / SG
  mediaRegion: "US",
  // 手动指定跳板节点名；留空则按 chainRegion 自动匹配
  manualNode: ""
};

// ---------------------------------------------------------------------------
// 节点与地区常量
// ---------------------------------------------------------------------------

// 按节点名识别地区（用于自动生成"地区线路"测速组）
var REGION_MAP = {
  US: { regex: /🇺🇸|美国|^US[\|丨\- ]/i, label: "美国", flag: "🇺🇸" },
  JP: { regex: /🇯🇵|日本|^JP[\|丨\- ]/i, label: "日本", flag: "🇯🇵" },
  HK: { regex: /🇭🇰|香港|^HK[\|丨\- ]/i, label: "香港", flag: "🇭🇰" },
  SG: { regex: /🇸🇬|新加坡|^SG[\|丨\- ]/i, label: "新加坡", flag: "🇸🇬" }
};

var NODE_NAMES = {
  relay: "自选节点 + 家宽IP",
  transit: "MiyaIP（官方中转）"
};

// 自动匹配地区组时，排除这些汇总组（避免把"节点选择"误判为地区线路组）
var EXCLUDED_GROUPS = ["节点选择"];

// ---------------------------------------------------------------------------
// DNS 域名组常量
// ---------------------------------------------------------------------------

var DOH_OVERSEAS = [
  "https://dns.google/dns-query",
  "https://cloudflare-dns.com/dns-query"
];
var DOH_DOMESTIC = [
  "https://dns.alidns.com/dns-query",
  "https://doh.pub/dns-query"
];
var DOH_FALLBACK = DOH_OVERSEAS.concat(["https://dns.quad9.net/dns-query"]);

var DOMAINS_APPLE = [
  "+.apple.com", "+.icloud.com", "+.icloud-content.com",
  "+.mzstatic.com", "+.apple-cloudkit.com", "+.cdn-apple.com", "+.aaplimg.com"
];
// 微软域名走链式代理，确保 Claude in Excel / PowerPoint 等插件正常访问
var DOMAINS_MICROSOFT = [
  "+.microsoft.com", "+.microsoftonline.com", "+.live.com",
  "+.office.com", "+.office.net", "+.office365.com",
  "+.msftauth.net", "+.msauth.net", "+.msecnd.net",
  "+.visualstudio.com", "+.vsassets.io", "+.vsmarketplacebadges.dev", "+.aka.ms"
];

// Anthropic / Claude, OpenAI / ChatGPT, Google AI / Gemini / Antigravity, Perplexity, AI 基础设施
var DOMAINS_AI_OVERSEAS = [
  "+.claude.ai", "+.anthropic.com", "+.claudeusercontent.com",
  "+.servd-anthropic-website.b-cdn.net",
  "+.openai.com", "+.chatgpt.com", "+.oaiusercontent.com", "+.oaistatic.com",
  "+.gemini.google.com", "+.aistudio.google.com", "+.ai.google.dev",
  "+.generativelanguage.googleapis.com",
  "+.antigravity.google", "+.antigravity-ide.com",
  "+.perplexity.ai", "+.perplexitycdn.com",
  "+.statsig.com",
  "+.openrouter.ai", "+.siliconflow.com", "+.aicodemirror.com"
];

var DOMAINS_MEDIA = {
  youtube: [
    "+.youtube.com", "+.googlevideo.com", "+.ytimg.com",
    "+.youtube-nocookie.com", "+.yt.be"
  ],
  netflix: [
    "+.netflix.com", "+.netflix.net", "+.nflxvideo.net",
    "+.nflxso.net", "+.nflximg.net", "+.nflximg.com",
    "+.nflxext.com"
  ],
  google: [
    "+.google.com", "+.googleapis.com", "+.gstatic.com",
    "+.google.co.jp", "+.google.com.hk",
    "+.googleusercontent.com", "+.ggpht.com"
  ],
  twitter: [
    "+.twitter.com", "+.x.com", "+.twimg.com",
    "+.t.co"
  ],
  facebook: [
    "+.facebook.com", "+.fbcdn.net", "+.fb.com",
    "+.facebook.net", "+.instagram.com", "+.cdninstagram.com"
  ],
  telegram: [
    "+.telegram.org", "+.t.me", "+.telegra.ph",
    "+.telesco.pe"
  ],
  discord: [
    "+.discord.com", "+.discord.gg", "+.discordapp.com",
    "+.discordapp.net", "+.discord.media"
  ]
};

// 所有流媒体/社交域名展平（供 DNS 和规则注入复用）
var ALL_MEDIA_DOMAINS = [];
Object.keys(DOMAINS_MEDIA).forEach(function(k) {
  ALL_MEDIA_DOMAINS.push.apply(ALL_MEDIA_DOMAINS, DOMAINS_MEDIA[k]);
});

// 通义千问、Kimi、智谱、MiniMax 等
var DOMAINS_AI_DOMESTIC = [
  "+.tongyi.aliyun.com", "+.qianwen.aliyun.com", "+.dashscope.aliyuncs.com",
  "+.moonshot.cn", "+.kimi.ai",
  "+.chatglm.cn", "+.zhipuai.cn", "+.bigmodel.cn",
  "+.minimaxi.com", "+.siliconflow.cn",
  "+.itssx.com", "+.claudecode.net.cn"
];

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/** 将 DNS 通配符前缀 "+." 转为规则所需的裸域名后缀 */
function toSuffix(d) { return d.replace("+.", ""); }

/**
 * 按顺序执行：凭证读取 → DNS/Sniffer 注入 → 代理链路注入 → 规则注入。
 */
function main(config) {
  var miya = takeMiyaCredentials(config);

  applyDnsAndSniffer(config);
  ensureProxyContainers(config);
  injectMiyaProxies(config, miya);

  var relayTarget = resolveRelayTarget(config, USER_OPTIONS.chainRegion, USER_OPTIONS.manualNode);
  bindDialerProxy(config, relayTarget);

  var chainGroupName = ensureChainGroup(config, USER_OPTIONS.chainRegion);
  var mediaGroupName = resolveMediaTarget(config, USER_OPTIONS.mediaRegion);
  injectManagedRules(config, chainGroupName, mediaGroupName);

  return config;
}

// ---------------------------------------------------------------------------
// 凭证读取
// ---------------------------------------------------------------------------

function takeMiyaCredentials(config) {
  if (!config._miya) {
    throw new Error("[家宽IP-链式代理] 缺少 config._miya，请确保 MiyaIP 凭证.js 已启用且排序在本脚本之前");
  }
  var miya = config._miya;
  delete config._miya; // 防止凭证输出到最终配置
  return miya;
}

// ---------------------------------------------------------------------------
// DNS + Sniffer
// ---------------------------------------------------------------------------

function applyDnsAndSniffer(config) {
  config.dns = buildDnsConfig();
  config.sniffer = buildSnifferConfig();
}

function buildNameserverPolicy() {
  var policy = {
    "geosite:openai": DOH_OVERSEAS,
    "+.cloud.google.com": DOH_OVERSEAS
  };

  // 微软域名 → 域外 DoH，Apple 域名 → 域内 DoH
  policy[DOMAINS_MICROSOFT.join(",")] = DOH_OVERSEAS;
  policy[DOMAINS_APPLE.join(",")] = DOH_DOMESTIC;

  // 域外 AI 域名 → 域外 DoH
  for (var i = 0; i < DOMAINS_AI_OVERSEAS.length; i++) {
    policy[DOMAINS_AI_OVERSEAS[i]] = DOH_OVERSEAS;
  }
  // 域内 AI 域名 → 域内 DoH
  for (var i = 0; i < DOMAINS_AI_DOMESTIC.length; i++) {
    policy[DOMAINS_AI_DOMESTIC[i]] = DOH_DOMESTIC;
  }
  // 流媒体与域外社交域名 → 域外 DoH
  for (var i = 0; i < ALL_MEDIA_DOMAINS.length; i++) {
    policy[ALL_MEDIA_DOMAINS[i]] = DOH_OVERSEAS;
  }

  return policy;
}

function buildDnsConfig() {
  var fakeIpFilter = [
    // 本地网络
    "*.lan", "*.local", "*.localhost", "localhost.ptlogin2.qq.com",
    // 系统时间同步
    "time.*.com", "time.*.gov", "time.*.edu.cn", "time.*.apple.com",
    "time-ios.apple.com", "time-macos.apple.com", "ntp.*.com",
    "ntp1.aliyun.com", "pool.ntp.org", "*.pool.ntp.org",
    // 网络连通性检测
    "www.msftconnecttest.com", "www.msftncsi.com",
    "*.msftconnecttest.com", "*.msftncsi.com"
  ].concat(DOMAINS_APPLE).concat([
    // 游戏/实时通信
    "+.srv.nintendo.net", "+.stun.playstation.net",
    "xbox.*.microsoft.com", "+.xboxlive.com",
    "*.battlenet.com.cn", "*.blzstatic.cn",
    "stun.*.*", "stun.*.*.*", "+.stun.*.*", "+.stun.*.*.*",
    // 家庭网络设备
    "*.mcdn.bilivideo.cn", "+.music.163.com", "+.126.net",
    "+.router.asus.com", "+.linksys.com", "+.tplinkwifi.net", "*.xiaoqiang.net"
  ]);

  var fallbackFilterDomain = ALL_MEDIA_DOMAINS.concat([
    "+.github.com"
  ]).concat(DOMAINS_MICROSOFT);

  return {
    enable: true,
    listen: "0.0.0.0:1053",
    ipv6: true,
    "respect-rules": false,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter": fakeIpFilter,
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    nameserver: DOH_DOMESTIC,
    "proxy-server-nameserver": DOH_DOMESTIC,
    "direct-nameserver": DOH_DOMESTIC.slice(),
    "direct-nameserver-follow-policy": true,
    fallback: DOH_FALLBACK,
    "fallback-filter": {
      geoip: true,
      "geoip-code": "CN",
      geosite: ["gfw"],
      ipcidr: ["240.0.0.0/4", "0.0.0.0/32"],
      domain: fallbackFilterDomain
    },
    "nameserver-policy": buildNameserverPolicy()
  };
}

function buildSnifferConfig() {
  return {
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    sniff: {
      TLS: { ports: [443, 8443] },
      HTTP: { ports: [80, 8080, 8880], "override-destination": true },
      QUIC: { ports: [443] }
    },
    "force-domain": [
      "+.cloudflare.com",
      "+.cdn.cloudflare.net"
    ],
    "skip-domain": [
      "+.push.apple.com",
      "+.apple.com",
      "+.lan",
      "+.local",
      "+.localhost"
    ]
  };
}

// ---------------------------------------------------------------------------
// MiyaIP 代理链路
// ---------------------------------------------------------------------------

function ensureProxyContainers(config) {
  if (!config.proxies) config.proxies = [];
  if (!config["proxy-groups"]) config["proxy-groups"] = [];
  if (!config.rules) config.rules = [];
}

function injectMiyaProxies(config, miya) {
  function makeProxy(name, endpoint) {
    return {
      name: name,
      type: "http",
      server: endpoint.server,
      port: endpoint.port,
      username: miya.username,
      password: miya.password,
      udp: true
    };
  }

  var miyaProxies = [
    makeProxy(NODE_NAMES.relay, miya.relay),
    makeProxy(NODE_NAMES.transit, miya.transit)
  ];

  for (var i = 0; i < miyaProxies.length; i++) {
    var p = miyaProxies[i];
    var exists = false;
    for (var j = 0; j < config.proxies.length; j++) {
      if (config.proxies[j].name === p.name) {
        exists = true;
        break;
      }
    }
    if (!exists) config.proxies.push(p);
  }
}

/**
 * 查找或创建指定地区的 url-test 代理组。
 * reuseExisting 为 true 时优先复用订阅已有的地区组（用于链式代理跳板选择）。
 */
function ensureRegionGroup(config, regionKey, nameSuffix, reuseExisting) {
  var regionInfo = REGION_MAP[String(regionKey || "").toUpperCase()];
  if (!regionInfo) return null;

  var regex = regionInfo.regex;
  var label = regionInfo.label;
  var flag = regionInfo.flag;
  var groupName = flag + "|" + label + nameSuffix;

  // 优先复用订阅里已有的地区代理组
  if (reuseExisting) {
    var groups = config["proxy-groups"];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (regex.test(g.name) && EXCLUDED_GROUPS.indexOf(g.name) < 0) {
        return g.name;
      }
    }
  }

  // 检查是否已存在同名组
  var groups = config["proxy-groups"];
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].name === groupName) return groupName;
  }

  // 筛选地区节点（排除 MiyaIP 自身节点）
  var regionNodes = [];
  var proxies = config.proxies;
  for (var i = 0; i < proxies.length; i++) {
    var p = proxies[i];
    if (regex.test(p.name) && p.name.indexOf("MiyaIP") < 0) {
      regionNodes.push(p.name);
    }
  }
  if (regionNodes.length === 0) return null;

  config["proxy-groups"].push({
    name: groupName,
    type: "url-test",
    proxies: regionNodes,
    url: "http://www.gstatic.com/generate_204",
    interval: 300,
    tolerance: 50
  });

  return groupName;
}

function resolveRelayTarget(config, region, manualNode) {
  if (manualNode) return manualNode;
  return ensureRegionGroup(config, region, "线路-链式代理-跳板", false);
}

function resolveMediaTarget(config, mediaRegion) {
  return ensureRegionGroup(config, mediaRegion, "线路-流媒体", false);
}

function bindDialerProxy(config, relayTarget) {
  var relayNode = null;
  for (var i = 0; i < config.proxies.length; i++) {
    if (config.proxies[i].name === NODE_NAMES.relay) {
      relayNode = config.proxies[i];
      break;
    }
  }
  if (relayNode) {
    if (relayTarget) relayNode["dialer-proxy"] = relayTarget;
    else delete relayNode["dialer-proxy"];
  }

  // 官方中转节点不挂 dialer-proxy
  var transitNode = null;
  for (var i = 0; i < config.proxies.length; i++) {
    if (config.proxies[i].name === NODE_NAMES.transit) {
      transitNode = config.proxies[i];
      break;
    }
  }
  if (transitNode) delete transitNode["dialer-proxy"];
}

function ensureChainGroup(config, region) {
  var regionKey = String(region || "").toUpperCase();
  var regionMeta = REGION_MAP[regionKey] || { label: region, flag: "🌐" };
  var chainGroupName = regionMeta.flag + "|" + regionMeta.label + "-链式代理-家宽IP出口";

  var groups = config["proxy-groups"];
  var exists = false;
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].name === chainGroupName) {
      exists = true;
      break;
    }
  }

  if (!exists) {
    config["proxy-groups"].push({
      name: chainGroupName,
      type: "select",
      proxies: [NODE_NAMES.transit, NODE_NAMES.relay]
    });
  }

  return chainGroupName;
}

// ---------------------------------------------------------------------------
// 规则注入（去重 + 置顶）
// ---------------------------------------------------------------------------

/** 提取规则的 "TYPE,domain" 前缀，用于去重匹配 */
function getRuleKey(rule) {
  var i = rule.indexOf(",");
  if (i < 0) return null;
  var j = rule.indexOf(",", i + 1);
  if (j < 0) return null;
  return rule.substring(0, j);
}

/**
 * 注入管理规则，优先级顺序：
 * 1) 域内 AI 直连（DIRECT）
 * 2) 流媒体锁区
 * 3) 域外 AI / 微软开发工具 / 出口质量测试 → 链式代理组
 */
function injectManagedRules(config, chainGroupName, mediaGroupName) {
  var directAiRules = buildDirectAiRules();
  var mediaRules = buildMediaRules(mediaGroupName);
  var chainProxyRules = buildChainProxyRules(chainGroupName);

  var managedRules = directAiRules.concat(mediaRules).concat(chainProxyRules);

  // 收集管理规则的 key，用于从订阅规则中去重
  var managedPatterns = {};
  for (var i = 0; i < managedRules.length; i++) {
    var key = getRuleKey(managedRules[i]);
    if (key) managedPatterns[key] = true;
  }

  // 过滤掉订阅中与管理规则冲突的条目
  var filteredRules = [];
  for (var i = 0; i < config.rules.length; i++) {
    var key = getRuleKey(config.rules[i]);
    if (key === null || !managedPatterns[key]) {
      filteredRules.push(config.rules[i]);
    }
  }
  config.rules = filteredRules;

  // 管理规则置顶
  for (var i = managedRules.length - 1; i >= 0; i--) {
    config.rules.unshift(managedRules[i]);
  }
}

function buildChainProxyRules(chainGroupName) {
  var rules = [];
  // 域外 AI 域名
  for (var i = 0; i < DOMAINS_AI_OVERSEAS.length; i++) {
    rules.push("DOMAIN-SUFFIX," + toSuffix(DOMAINS_AI_OVERSEAS[i]) + "," + chainGroupName);
  }
  rules.push("DOMAIN-SUFFIX,cdn.cloudflare.net," + chainGroupName);
  // 微软与开发工具
  for (var i = 0; i < DOMAINS_MICROSOFT.length; i++) {
    rules.push("DOMAIN-SUFFIX," + toSuffix(DOMAINS_MICROSOFT[i]) + "," + chainGroupName);
  }
  // 关键词兜底（捕获未被 DOMAIN-SUFFIX 覆盖的子域名或新域名）
  // 不兜底 gemini/claude：这两个词过于常见，容易误匹配无关域名；
  // 而 anthropic/openai/chatgpt/perplexity 足够独特，误匹配风险极低。
  rules.push("DOMAIN-KEYWORD,anthropic," + chainGroupName);
  rules.push("DOMAIN-KEYWORD,openai," + chainGroupName);
  rules.push("DOMAIN-KEYWORD,chatgpt," + chainGroupName);
  rules.push("DOMAIN-KEYWORD,perplexity," + chainGroupName);
  // 出口质量测试
  rules.push("DOMAIN-SUFFIX,ping0.cc," + chainGroupName);
  rules.push("DOMAIN-SUFFIX,ipinfo.io," + chainGroupName);
  return rules;
}

function buildDirectAiRules() {
  var rules = [];
  for (var i = 0; i < DOMAINS_AI_DOMESTIC.length; i++) {
    rules.push("DOMAIN-SUFFIX," + toSuffix(DOMAINS_AI_DOMESTIC[i]) + ",DIRECT");
  }
  return rules;
}

function buildMediaRules(mediaGroupName) {
  if (!mediaGroupName) return [];
  var rules = [];
  for (var i = 0; i < ALL_MEDIA_DOMAINS.length; i++) {
    rules.push("DOMAIN-SUFFIX," + toSuffix(ALL_MEDIA_DOMAINS[i]) + "," + mediaGroupName);
  }
  return rules;
}
