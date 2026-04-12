const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "src", "家宽IP-链式代理.js");
const scriptCode = fs.readFileSync(scriptPath, "utf8");
const TEST_MIYA_CREDENTIALS = {
  username: "user",
  password: "pass",
  relay: { server: "1.2.3.4", port: 8000 },
  transit: { server: "transit.example.com", port: 8001 }
};
const BROWSER_APPS = ["Dia", "Atlas", "Google Chrome", "SunBrowser"];
const BROWSER_HELPER_SUFFIXES = [
  "Helper",
  "Helper (Renderer)",
  "Helper (GPU)",
  "Helper (Plugin)",
  "Helper (Alerts)"
];

function buildBrowserProcessNames(browserApps, helperSuffixes) {
  const processNames = [];
  for (const browserApp of browserApps) {
    processNames.push(browserApp);
    for (const helperSuffix of helperSuffixes) {
      processNames.push(browserApp + " " + helperSuffix);
    }
  }
  return processNames;
}

// 关键链路目标和受管规则前缀。
const EXPECTED = {
  chainGroupName: "🇸🇬|新加坡-链式代理-家宽IP出口",
  relayGroupName: "🇸🇬|新加坡-链式代理-跳板",
  mediaGroupName: "🇺🇸|美国-媒体",
  managedNodes: {
    relayName: "自选节点 + 家宽IP",
    transitName: "MiyaIP（官方中转）",
    relayMembers: ["🇸🇬 SG Auto 01"],
    mediaMembers: ["🇺🇸 US Auto 01"],
    chainMembers: ["MiyaIP（官方中转）", "自选节点 + 家宽IP"],
    nodeSelectionMembers: [
      "🇸🇬 SG Auto 01",
      "🇸🇬|新加坡-链式代理-跳板",
      "🇺🇸|美国-媒体"
    ]
  },
  managedRulePrefix: [
    "PROCESS-NAME,Claude,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Claude Helper,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,ChatGPT,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,ChatGPT Helper,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Perplexity,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Perplexity Helper,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Cursor,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Cursor Helper,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,ChatGPTHelper,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Claude Helper (Renderer),🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Claude Helper (GPU),🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Claude Helper (Plugin),🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Claude Code,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Claude Code URL Handler,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Antigravity.app,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,Quotio.app,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,claude,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,gemini,🇸🇬|新加坡-链式代理-家宽IP出口",
    "PROCESS-NAME,codex,🇸🇬|新加坡-链式代理-家宽IP出口"
  ],
  direct: {
    domesticOfficeDomains: [
      "+.docs.qq.com",
      "+.dingtalk.com",
      "+.feishu.cn",
      "+.wps.cn"
    ],
    domesticOfficeRules: [
      "DOMAIN-SUFFIX,docs.qq.com,DIRECT",
      "DOMAIN-SUFFIX,dingtalk.com,DIRECT",
      "DOMAIN-SUFFIX,feishu.cn,DIRECT",
      "DOMAIN-SUFFIX,wps.cn,DIRECT"
    ],
    overseasAppRules: [
      "DOMAIN-SUFFIX,tailscale.com,DIRECT",
      "DOMAIN-SUFFIX,tailscale.io,DIRECT",
      "DOMAIN-SUFFIX,ts.net,DIRECT",
      "IP-CIDR,100.64.0.0/10,DIRECT,no-resolve",
      "IP-CIDR,100.100.100.100/32,DIRECT,no-resolve",
      "IP-CIDR6,fd7a:115c:a1e0::/48,DIRECT,no-resolve"
    ]
  },
  process: {
    browserManaged: buildBrowserProcessNames(BROWSER_APPS, BROWSER_HELPER_SUFFIXES),
    browserExcluded: ["Arc", "Microsoft Edge"],
    aiCliManaged: ["claude", "gemini", "codex"],
    aiCliExcluded: ["opencode"],
    unmanagedChain: ["Google Drive", "Visual Studio Code"],
    unmanagedDirect: ["WeChat", "Tailscale"]
  },
  dns: {
    overseasPolicyDomains: [
      "+.sora.com",
      "+.notebooklm.google",
      "+.m365.cloud.microsoft"
    ],
    strictSnifferDomains: ["+.claude.ai", "+.google.com"],
    fakeIpDomains: ["+.xboxlive.com", "stun.*.*"],
    overseasAppDomains: ["+.tailscale.com", "+.tailscale.io", "+.ts.net"]
  }
};

// 读取脚本并构造隔离执行环境。
function loadSandbox() {
  const sandbox = {
    console,
    Object,
    Array,
    String,
    Error
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox, { filename: scriptPath });
  return sandbox;
}

// 构造最小基础配置，只保留当前脚本实际依赖的对象。
function createBaseConfig() {
  return {
    proxies: [
      { name: "🇸🇬 SG Auto 01", type: "ss" },
      { name: "🇭🇰 HK Auto 01", type: "ss" },
      { name: "🇺🇸 US Auto 01", type: "ss" }
    ],
    "proxy-groups": [
      {
        name: "节点选择",
        type: "select",
        proxies: ["🇸🇬 SG Auto 01"]
      }
    ],
    rules: [
      "DOMAIN-SUFFIX,claude.ai,DIRECT",
      "DOMAIN-SUFFIX,tailscale.com,REJECT",
      "MATCH,节点选择"
    ],
    _miya: {
      username: TEST_MIYA_CREDENTIALS.username,
      password: TEST_MIYA_CREDENTIALS.password,
      relay: {
        server: TEST_MIYA_CREDENTIALS.relay.server,
        port: TEST_MIYA_CREDENTIALS.relay.port
      },
      transit: {
        server: TEST_MIYA_CREDENTIALS.transit.server,
        port: TEST_MIYA_CREDENTIALS.transit.port
      }
    }
  };
}

// 运行主脚本，并允许测试按需覆写配置或沙箱。
function runMain(configMutator, sandboxMutator) {
  const sandbox = loadSandbox();
  const config = createBaseConfig();

  if (typeof sandboxMutator === "function") sandboxMutator(sandbox);
  if (typeof configMutator === "function") configMutator(config);

  return {
    sandbox,
    output: sandbox.main(config)
  };
}

// 提取受管规则身份，用于检查同一规则是否重复注入。
function extractRuleIdentity(ruleLine) {
  const firstCommaIndex = ruleLine.indexOf(",");
  const secondCommaIndex = ruleLine.indexOf(",", firstCommaIndex + 1);
  return ruleLine.slice(0, secondCommaIndex);
}

// 断言规则前缀没有重复身份。
function assertNoDuplicateRuleIdentities(ruleLines) {
  const seen = new Set();
  for (const ruleLine of ruleLines) {
    const identity = extractRuleIdentity(ruleLine);
    if (seen.has(identity)) {
      throw new Error("Duplicate managed rule identity found: " + identity);
    }
    seen.add(identity);
  }
}

function assertRuleExists(ruleLines, ruleLine) {
  assert(ruleLines.includes(ruleLine), "Expected rule not found: " + ruleLine);
}

function assertRuleMissing(ruleLines, ruleLine) {
  assert(!ruleLines.includes(ruleLine), "Unexpected rule found: " + ruleLine);
}

function assertRulesExist(ruleLines, expectedRules) {
  for (const ruleLine of expectedRules) {
    assertRuleExists(ruleLines, ruleLine);
  }
}

function assertRulesMissing(ruleLines, unexpectedRules) {
  for (const ruleLine of unexpectedRules) {
    assertRuleMissing(ruleLines, ruleLine);
  }
}

function assertRulePrefix(actualRules, expectedPrefix) {
  const actualPrefix = Array.prototype.slice.call(actualRules, 0, expectedPrefix.length);
  assert.strictEqual(JSON.stringify(actualPrefix), JSON.stringify(expectedPrefix));
}

function assertProcessRules(output, enabled, processNames, target) {
  for (const processName of processNames) {
    const ruleLine = "PROCESS-NAME," + processName + "," + target;
    if (enabled) assertRuleExists(output.rules, ruleLine);
    else assertRuleMissing(output.rules, ruleLine);
  }
}

function findGroup(output, groupName) {
  return output["proxy-groups"].find((group) => group.name === groupName);
}

function findProxy(output, proxyName) {
  return output.proxies.find((proxy) => proxy.name === proxyName);
}

function assertNameserverPolicyValues(output, domains, expectedValue) {
  for (const domain of domains) {
    assert.strictEqual(
      JSON.stringify(output.dns["nameserver-policy"][domain]),
      JSON.stringify(expectedValue)
    );
  }
}

function assertArrayIncludesAll(values, expectedValues, label) {
  for (const expectedValue of expectedValues) {
    assert(
      values.includes(expectedValue),
      label + " missing expected value: " + expectedValue
    );
  }
}

function assertArrayExcludesAll(values, excludedValues, label) {
  for (const excludedValue of excludedValues) {
    assert(
      !values.includes(excludedValue),
      label + " unexpectedly contains: " + excludedValue
    );
  }
}

// MiyaIP 节点、跳板组和家宽出口组都应收敛成脚本期望结构。
function assertManagedProxyTopology(output, expectedRelayTarget) {
  const relayProxy = findProxy(output, EXPECTED.managedNodes.relayName);
  const transitProxy = findProxy(output, EXPECTED.managedNodes.transitName);
  const relayGroup = findGroup(output, EXPECTED.relayGroupName);
  const chainGroup = findGroup(output, EXPECTED.chainGroupName);
  const mediaGroup = findGroup(output, EXPECTED.mediaGroupName);
  const nodeSelectionGroup = findGroup(output, "节点选择");

  assert(relayProxy, "Expected relay proxy to exist");
  assert.strictEqual(relayProxy.type, "http");
  assert.strictEqual(relayProxy.server, TEST_MIYA_CREDENTIALS.relay.server);
  assert.strictEqual(relayProxy.port, TEST_MIYA_CREDENTIALS.relay.port);
  assert.strictEqual(relayProxy.username, TEST_MIYA_CREDENTIALS.username);
  assert.strictEqual(relayProxy.password, TEST_MIYA_CREDENTIALS.password);
  assert.strictEqual(relayProxy.udp, true);
  assert.strictEqual(relayProxy["dialer-proxy"], expectedRelayTarget);

  assert(transitProxy, "Expected transit proxy to exist");
  assert.strictEqual(transitProxy.type, "http");
  assert.strictEqual(transitProxy.server, TEST_MIYA_CREDENTIALS.transit.server);
  assert.strictEqual(transitProxy.port, TEST_MIYA_CREDENTIALS.transit.port);
  assert.strictEqual(transitProxy.username, TEST_MIYA_CREDENTIALS.username);
  assert.strictEqual(transitProxy.password, TEST_MIYA_CREDENTIALS.password);
  assert.strictEqual(transitProxy.udp, true);
  assert.strictEqual(transitProxy["dialer-proxy"], undefined);

  assert(relayGroup, "Expected relay group to exist");
  assert.strictEqual(relayGroup.type, "url-test");
  assert.strictEqual(
    JSON.stringify(relayGroup.proxies),
    JSON.stringify(EXPECTED.managedNodes.relayMembers)
  );

  assert(chainGroup, "Expected chain group to exist");
  assert.strictEqual(chainGroup.type, "select");
  assert.strictEqual(
    JSON.stringify(chainGroup.proxies),
    JSON.stringify(EXPECTED.managedNodes.chainMembers)
  );

  assert(mediaGroup, "Expected media group to exist");
  assert.strictEqual(mediaGroup.type, "url-test");
  assert.strictEqual(
    JSON.stringify(mediaGroup.proxies),
    JSON.stringify(EXPECTED.managedNodes.mediaMembers)
  );

  assert(nodeSelectionGroup, "Expected 节点选择 group to exist");
  assert.strictEqual(nodeSelectionGroup.type, "select");
  assert.strictEqual(
    JSON.stringify(nodeSelectionGroup.proxies),
    JSON.stringify(EXPECTED.managedNodes.nodeSelectionMembers)
  );
}

// 把 CANARIES 声明展开成 "{TYPE,value,target}" 规则行。
function buildCanaryRuleLines(canaries, target) {
  const lines = [];
  const domainSuffixes = canaries.domainSuffixes || [];
  for (const domain of domainSuffixes) {
    lines.push("DOMAIN-SUFFIX," + domain + "," + target);
  }
  const alwaysProcessNames = canaries.alwaysProcessNames || [];
  for (const proc of alwaysProcessNames) {
    lines.push("PROCESS-NAME," + proc + "," + target);
  }
  const cliProcessNames = canaries.cliProcessNames || [];
  for (const proc of cliProcessNames) {
    lines.push("PROCESS-NAME," + proc + "," + target);
  }
  return lines;
}

// 严格链式路由必须覆盖域外 AI 主域和受管 AI 进程。canary 期望从脚本内 CANARIES 派生。
function assertCoreStrictRouting(output, sandbox) {
  assertRulesExist(
    output.rules,
    buildCanaryRuleLines(sandbox.CANARIES.strictAi, EXPECTED.chainGroupName)
  );
  assertRulesMissing(output.rules, [
    "DOMAIN-SUFFIX,claude.ai,DIRECT"
  ]);
}

function assertMediaRouting(output, sandbox) {
  const expected = buildCanaryRuleLines(sandbox.CANARIES.media, EXPECTED.mediaGroupName);
  assertRulesExist(output.rules, expected);
  assertRulesMissing(
    output.rules,
    buildCanaryRuleLines(sandbox.CANARIES.media, EXPECTED.chainGroupName)
  );
}

function assertBrowserRouting(output) {
  assertProcessRules(
    output,
    true,
    EXPECTED.process.browserManaged,
    EXPECTED.chainGroupName
  );
  assertProcessRules(
    output,
    false,
    EXPECTED.process.browserManaged,
    EXPECTED.mediaGroupName
  );
  assertProcessRules(
    output,
    false,
    EXPECTED.process.browserExcluded,
    EXPECTED.chainGroupName
  );
}

// 域内办公域名只走 DIRECT，不再依赖进程规则。
function assertDomesticDirectCoverage(output, sandbox) {
  assertRulesExist(output.rules, EXPECTED.direct.domesticOfficeRules);
  assertRulesMissing(output.rules, [
    "PROCESS-NAME,WeChat,DIRECT",
    "PROCESS-NAME,DingTalk,DIRECT",
    "PROCESS-NAME,Feishu,DIRECT",
    "PROCESS-NAME,WPS Office,DIRECT"
  ]);
  assertNameserverPolicyValues(
    output,
    EXPECTED.direct.domesticOfficeDomains,
    sandbox.BASE.dns.domestic
  );
}

// 域外应用直连保持 DIRECT、域外 DoH 和 skip-domain 组合。
function assertOverseasAppDirectCoverage(output, sandbox) {
  assertRulesExist(output.rules, EXPECTED.direct.overseasAppRules);
  assertRulesMissing(output.rules, [
    "PROCESS-NAME,Tailscale,DIRECT",
    "PROCESS-NAME,tailscale,DIRECT",
    "PROCESS-NAME,IPNExtension,DIRECT"
  ]);
  assertNameserverPolicyValues(
    output,
    EXPECTED.dns.overseasAppDomains,
    sandbox.BASE.dns.overseas
  );
  assertArrayIncludesAll(
    output.dns["fallback-filter"].domain,
    EXPECTED.dns.overseasAppDomains,
    "fallback-filter.domain"
  );
  assertArrayIncludesAll(
    output.sniffer["skip-domain"],
    EXPECTED.dns.overseasAppDomains,
    "sniffer.skip-domain"
  );
  assertArrayExcludesAll(
    output.dns["fake-ip-filter"],
    ["+.tailscale.com"],
    "fake-ip-filter"
  );
}

// DNS 和 Sniffer 仍要覆盖关键域外 AI 与支撑平台。
function assertDnsAndSniffer(output, sandbox) {
  assertNameserverPolicyValues(
    output,
    EXPECTED.dns.overseasPolicyDomains,
    sandbox.BASE.dns.overseas
  );
  assertArrayIncludesAll(
    output.dns["fake-ip-filter"],
    EXPECTED.dns.fakeIpDomains,
    "fake-ip-filter"
  );
  assertArrayIncludesAll(
    output.dns["fallback-filter"].domain,
    ["+.sora.com", "+.youtube.com"],
    "fallback-filter.domain"
  );
  assertArrayIncludesAll(
    output.sniffer["force-domain"],
    EXPECTED.dns.strictSnifferDomains,
    "sniffer.force-domain"
  );
}

function testDefaultConfig() {
  const result = runMain();
  const sandbox = result.sandbox;
  const output = result.output;

  assert.strictEqual(sandbox.USER_OPTIONS.enableChainRegionBrowserProcessProxy, true);
  assert.strictEqual(sandbox.USER_OPTIONS.enableChainRegionAiCliProcessProxy, true);
  assert.strictEqual(output._miya, undefined);
  assertManagedProxyTopology(output, EXPECTED.relayGroupName);

  assertCoreStrictRouting(output, sandbox);
  assertMediaRouting(output, sandbox);
  assertBrowserRouting(output);
  assertDomesticDirectCoverage(output, sandbox);
  assertOverseasAppDirectCoverage(output, sandbox);
  assertDnsAndSniffer(output, sandbox);
  assertNoDuplicateRuleIdentities(output.rules.slice(0, 250));
  assertRulePrefix(output.rules, EXPECTED.managedRulePrefix);
}

function testDisableBrowserProcessProxy() {
  const output = runMain(null, function (sandbox) {
    sandbox.USER_OPTIONS.enableChainRegionBrowserProcessProxy = false;
  }).output;

  assertProcessRules(
    output,
    false,
    EXPECTED.process.browserManaged,
    EXPECTED.chainGroupName
  );
  assertProcessRules(
    output,
    false,
    EXPECTED.process.browserExcluded,
    EXPECTED.chainGroupName
  );
}

function testAiCliProcessProxyDefaultsOn() {
  const output = runMain().output;
  assertProcessRules(
    output,
    true,
    EXPECTED.process.aiCliManaged,
    EXPECTED.chainGroupName
  );
  assertProcessRules(
    output,
    false,
    EXPECTED.process.aiCliExcluded,
    EXPECTED.chainGroupName
  );
}

function testDisableAiCliProcessProxy() {
  const output = runMain(null, function (sandbox) {
    sandbox.USER_OPTIONS.enableChainRegionAiCliProcessProxy = false;
  }).output;

  assertProcessRules(
    output,
    false,
    EXPECTED.process.aiCliManaged.concat(EXPECTED.process.aiCliExcluded),
    EXPECTED.chainGroupName
  );
}

function testOnlyAiAndBrowserProcessesAreManaged() {
  const output = runMain().output;

  assertProcessRules(
    output,
    false,
    EXPECTED.process.unmanagedChain,
    EXPECTED.chainGroupName
  );
  assertRulesMissing(
    output.rules,
    EXPECTED.process.unmanagedDirect.map(function (processName) {
      return "PROCESS-NAME," + processName + ",DIRECT";
    })
  );
}

function testLegacyProcessProxyOptionAliasesStillWork() {
  const output = runMain(null, function (sandbox) {
    delete sandbox.USER_OPTIONS.enableChainRegionBrowserProcessProxy;
    delete sandbox.USER_OPTIONS.enableChainRegionAiCliProcessProxy;
    sandbox.USER_OPTIONS.enableBrowserProcessProxy = false;
    sandbox.USER_OPTIONS.enableAiCliProcessProxy = false;
  }).output;

  assertProcessRules(
    output,
    false,
    EXPECTED.process.browserManaged,
    EXPECTED.chainGroupName
  );
  assertProcessRules(
    output,
    false,
    EXPECTED.process.aiCliManaged,
    EXPECTED.chainGroupName
  );
}

function testMissingRegionFails() {
  const sandbox = loadSandbox();
  const config = createBaseConfig();
  sandbox.USER_OPTIONS.chainRegion = "JP";

  assert.throws(
    function () {
      sandbox.main(config);
    },
    /未找到可用的 JP 节点/
  );
}

function testMissingMediaRegionFails() {
  const sandbox = loadSandbox();
  const config = createBaseConfig();
  sandbox.USER_OPTIONS.mediaRegion = "JP";

  assert.throws(
    function () {
      sandbox.main(config);
    },
    /未找到可用的 JP 媒体节点/
  );
}

function testMissingStrictTargetFails() {
  const sandbox = loadSandbox();
  const originalResolveRoutingTargets = sandbox.resolveRoutingTargets;
  sandbox.resolveRoutingTargets = function (config, chainRegion, mediaRegion) {
    const routingTargets = originalResolveRoutingTargets(config, chainRegion, mediaRegion);
    routingTargets.strictAiTarget = "错误目标";
    return routingTargets;
  };

  assert.throws(
    function () {
      sandbox.main(createBaseConfig());
    },
    /域外 AI 与支撑平台未直接指向当前 chainRegion 出口/
  );
}

function testExistingManagedObjectsAreReconciled() {
  const output = runMain(function (config) {
    config.proxies.push({
      name: EXPECTED.managedNodes.relayName,
      type: "http",
      server: "bad.example.com",
      port: 1,
      username: "bad",
      password: "bad",
      udp: false,
      "dialer-proxy": "错误目标"
    });
    config.proxies.push({
      name: EXPECTED.managedNodes.transitName,
      type: "http",
      server: "bad-transit.example.com",
      port: 2,
      username: "bad",
      password: "bad",
      udp: false,
      "dialer-proxy": "错误目标"
    });
    config["proxy-groups"].push({
      name: EXPECTED.relayGroupName,
      type: "select",
      proxies: [EXPECTED.chainGroupName]
    });
    config["proxy-groups"].push({
      name: EXPECTED.chainGroupName,
      type: "select",
      proxies: ["DIRECT"]
    });
    config["proxy-groups"].push({
      name: EXPECTED.mediaGroupName,
      type: "select",
      proxies: ["DIRECT"]
    });
  }).output;

  assertManagedProxyTopology(output, EXPECTED.relayGroupName);
}

function testChainGroupIsNotReusedAsRelayTarget() {
  const output = runMain(function (config) {
    config["proxy-groups"].push({
      name: EXPECTED.chainGroupName,
      type: "select",
      proxies: EXPECTED.managedNodes.chainMembers.slice()
    });
  }).output;

  assertManagedProxyTopology(output, EXPECTED.relayGroupName);
}

function testBadExternalRegionGroupIsNotReused() {
  const output = runMain(function (config) {
    config["proxy-groups"].push({
      name: "🇸🇬 错误地区组",
      type: "select",
      proxies: ["DIRECT"]
    });
  }).output;

  assertManagedProxyTopology(output, EXPECTED.relayGroupName);
}

function testNodeSelectionKeepsOnlyCurrentRelayGroup() {
  const output = runMain(function (config) {
    config["proxy-groups"][0].proxies = [
      "🇸🇬 SG Auto 01",
      "🇭🇰|香港-链式代理-跳板",
      "🇸🇬|新加坡-媒体"
    ];
  }).output;

  assertManagedProxyTopology(output, EXPECTED.relayGroupName);
}

function testRepeatedRunDoesNotCreateSelfReference() {
  const firstOutput = runMain().output;
  const rerunInput = JSON.parse(JSON.stringify(firstOutput));
  const sandbox = loadSandbox();

  rerunInput._miya = {
    username: TEST_MIYA_CREDENTIALS.username,
    password: TEST_MIYA_CREDENTIALS.password,
    relay: {
      server: TEST_MIYA_CREDENTIALS.relay.server,
      port: TEST_MIYA_CREDENTIALS.relay.port
    },
    transit: {
      server: TEST_MIYA_CREDENTIALS.transit.server,
      port: TEST_MIYA_CREDENTIALS.transit.port
    }
  };

  const secondOutput = sandbox.main(rerunInput);

  assertManagedProxyTopology(secondOutput, EXPECTED.relayGroupName);
  assert.strictEqual(
    secondOutput["proxy-groups"].filter((group) => group.name === EXPECTED.chainGroupName).length,
    1
  );
  assert.strictEqual(
    secondOutput["proxy-groups"].filter((group) => group.name === EXPECTED.relayGroupName).length,
    1
  );
  assert.strictEqual(
    secondOutput["proxy-groups"].filter((group) => group.name === EXPECTED.mediaGroupName).length,
    1
  );
}

testDefaultConfig();
testDisableBrowserProcessProxy();
testAiCliProcessProxyDefaultsOn();
testDisableAiCliProcessProxy();
testOnlyAiAndBrowserProcessesAreManaged();
testLegacyProcessProxyOptionAliasesStillWork();
testMissingRegionFails();
testMissingMediaRegionFails();
testMissingStrictTargetFails();
testExistingManagedObjectsAreReconciled();
testChainGroupIsNotReusedAsRelayTarget();
testBadExternalRegionGroupIsNotReused();
testNodeSelectionKeepsOnlyCurrentRelayGroup();
testRepeatedRunDoesNotCreateSelfReference();

console.log("validate.js: all checks passed");
