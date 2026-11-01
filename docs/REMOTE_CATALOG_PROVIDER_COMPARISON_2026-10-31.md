# 远程样机库供应商候选比较

状态：已完成定向官方资料核验；尚未作出供应商人工决定；未购买域名；未备案；未部署。  
决定人：Wang Zhentao  
评估日期：2026-10-31  
适用需求：中国大陆为主、暂无域名、首期按 100 个真实样机规划且初始正式库最多 200 个、每月绝对预算不超过 200 元、一年内可能增加付费或团队私有样机。

## 1. 结论

只保留两个候选：

1. **主候选：阿里云 OSS + CDN**
2. **备选：腾讯云 COS + CDN**

两者都能提供中国内地对象存储、自定义 HTTPS 域名、CDN、私有 Bucket 和限时签名 URL。两者也都要求用于中国内地 CDN 的域名完成 ICP 备案。

当前倾向阿里云，不是因为腾讯云不合格，而是阿里云当前官方资料对我们需要的计费、静态 HTTPS 请求免费额度、用量封顶和 OSS 私有回源说明更直接。这只是**进入隔离试点的推荐**，不是上线批准。如果决定人已有腾讯云实名账号或可备案资源，而阿里云没有，主备顺序应直接反转；这个运营前提比约 0.002 元/GB/月的存储价差重要得多。

## 2. 客观对比

| 门禁 | 阿里云 OSS + CDN | 腾讯云 COS + CDN | 当前判定 |
| --- | --- | --- | --- |
| 中国内地自定义域名 | 内地 OSS Bucket 绑定域名、内地/全球 CDN 均要 ICP 备案 | 中国境内 CDN 要 ICP 备案 | 两者纸面通过；我们当前无域名，尚未过实操门禁 |
| 公开静态目录 | OSS 自定义域名 + CDN，可配置缓存和 HTTPS | COS 自定义 CDN 域名，可配置 HTTPS 和缓存 | 两者纸面通过 |
| 当前存储价格样例 | 标准本地冗余官方示例 0.12 元/GB/月 | 广州标准存储官方示例 0.118 元/GB/月 | 对当前 14.29 MiB 全部目录几乎没有决策意义 |
| CDN 与 HTTPS 计费 | 按流量/带宽计费；官方选购示例中国内地约 0.24 元/GB；静态 HTTPS 每月前 500 万次免费 | 按流量/带宽计费；HTTPS 超过每月 300 万次后产生费用；实际单价以账户价格计算器为准 | 都可进入低流量试点；不以促销价作长期承诺 |
| 费用失控防护 | 支持用量封顶，超限可下线域名；官方提示约有 10 分钟监控延迟 | 支持自然月流量/请求封顶和告警；官方同样提示约 10 分钟延迟 | 两者纸面通过；封顶不是零超支保证 |
| 未来付费/团队私有 | 私有 OSS + 限时预签名 URL，或私有回源 + CDN URL 鉴权 | 私有 COS + 限时预签名 URL，或私有回源 + CDN 时间戳鉴权 | 两者具备底层能力；用户购买权仍需我们自己的身份/授权服务 |
| 原子 manifest 激活、故障注入、真实插件回滚 | 官方资料不能代替项目实测 | 官方资料不能代替项目实测 | **两者均未通过，必须做隔离试点** |

## 3. 100–200 个样机的重新预算

必须把三个不同概念分开：

- **100 个**：首期实际准备和运营计划；
- **200 个**：首个正式库未经新决定不得超过的业务硬上限；
- **500 个**：程序为防止异常 manifest 设置的技术拒绝上限，不是采购、运营或预算规模。

当前本地正式库的 5 个活动 r3 样机实测：主图平均约 0.573 MiB，缩略图平均约 85.5 KiB；全部 production 历史约 14.29 MiB。插件的缩略图采用懒加载，首次选择后只预取相邻 3 个样机的主图和缩略图，并把图片缓存限制为 8 项。因此，样机从 100 增加到 200 时，首次会话不会下载全部主图；主要增加的是 manifest 大小，而不是把流量直接翻倍。

按现有 5 项真实文件线性估算：

| 规模 | 当前活动版本媒体 + manifest | 按现有历史比例预估的全部目录 | 一次首次冷会话估算 | 10,000 次首次冷会话 | 按 0.24 元/GB 估算 CDN 下行 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 个 | 约 66.1 MiB | 约 285.9 MiB | 约 3.08 MiB | 约 30.0 GiB | 约 7.2 元 |
| 200 个 | 约 132.1 MiB | 约 571.7 MiB | 约 3.47 MiB | 约 33.9 GiB | 约 8.1 元 |

阿里云官方示例的标准本地冗余存储为 0.12 元/GB/月；按上表规模，100–200 个样机的存储本身远低于 1 元/月。真正的成本风险是用户进一步打开大量样机、回源、请求、攻击和流量盗刷，而不是文件静态存储。上表是基于当前素材体积和当前加载算法的**估算**，不是账单保证；正式账单仍受地域、账户、资源包、请求、HTTPS、回源和促销影响。

重新冻结的预算门禁：

- 正常月度完整云费用目标：**不超过 30 元**；
- 月费用达到 **50 元**：必须复核流量来源、缓存命中和账单结构；
- 未经新决定允许的月度运营上限：**80 元**；
- 决定人声明的绝对月预算上限仍为 **200 元**，但它不是日常运营目标，也不是自动可花额度；
- 月度 CDN 流量封顶：**100 GB**，在 20 GB、50 GB、80 GB 设置告警；
- 达到 80 GB：停止非紧急素材发布并人工复核；任何把流量封顶提高到 100 GB 以上或把首期正式库提高到 200 个以上的行为，都必须由 Wang Zhentao 重新决定；
- 100 GB 按 0.24 元/GB 规划约为 24 元，给域名、请求、HTTPS、回源和价格波动留出缓冲；
- 平台用量封顶存在约 10 分钟监控/下发延迟，可能在关停前继续计费，因此不得宣称绝对不会越过任一金额；
- 正式上线前仍须使用真实账号价格计算器，并以 7 天隔离试点的实际存储、回源、下行、请求和 HTTPS 用量复算。

## 4. 一年内付费/团队私有的正确边界

现在不应为了未来付费而把公开目录改成重后端，但必须从现在保留正确的分层：

```text
现在：免费公开目录
assets.<root-domain>/v1/manifest.json
        ↓
对象存储 + CDN，只读，无用户秘密

未来：付费/团队私有目录
api.<root-domain> 校验登录、订阅、团队和权利
        ↓
返回短时效授权后的私有 manifest/素材 URL
        ↓
私有 Bucket + CDN URL 鉴权
```

硬约束：

- 插件内永远不放云服务 AccessKey、CDN 鉴权密钥或永久下载令牌；
- Referer 防盗链只是降低盗刷，不能代替购买权鉴权；
- 免费和付费素材分开 Bucket/权限边界，不把全部私有库暴露给 CDN 公网 URL；
- 每次请求由服务端按用户、团队、素材和有效期签发；
- 开始商业化前必须另行冻结登录、支付/订阅、权利、撤权、离线许可和隐私合同；
- 这一变化需要新的插件版本和真实宿主回归，不是只更新远程目录。

## 5. 还未通过的阻断项

1. 域名未购买、未实名、未备案；
2. 尚不知道使用个人还是企业主体备案；
3. 尚未用真实账号价格计算器生成成本快照；
4. 两家均未做隔离子域试点、部分上传、错误 manifest、缓存、证书和回滚故障注入；
5. 没有远程真实 Figma 插件读取证据；
6. 没有供应商人工选择和任何外部部署授权。

因此，当前最高只能说：**架构可行，阿里云和腾讯云都达到纸面候选门槛，阿里云是当前推荐的第一试点对象。**

## 6. 官方资料

阿里云：

- [OSS 计费概述](https://help.aliyun.com/en/oss/billing-overview)
- [OSS 自定义域名与 ICP 要求](https://help.aliyun.com/zh/oss/user-guide/access-buckets-via-custom-domain-names)
- [CDN 加速域名与 ICP 要求](https://help.aliyun.com/zh/cdn/add-a-domain-name)
- [CDN 计费概述](https://help.aliyun.com/zh/cdn/product-overview/billing-overview)
- [CDN 资源包规划示例](https://help.aliyun.com/zh/cdn/product-overview/guidelines-for-choosing-resource-plans)
- [静态 HTTPS 请求计费](https://help.aliyun.com/zh/cdn/product-overview/billing-of-https-requests-for-static-content/)
- [OSS + CDN 私有回源与 URL 鉴权](https://help.aliyun.com/zh/oss/user-guide/cdn-acceleration)
- [OSS 预签名 URL](https://help.aliyun.com/zh/oss/user-guide/upload-files-using-presigned-urls)
- [CDN 用量封顶](https://help.aliyun.com/zh/cdn/user-guide/usage-cap-faq)

腾讯云：

- [COS 预签名 URL](https://cloud.tencent.com/document/product/436/68284)
- [COS 自定义 CDN 域名](https://cloud.tencent.com/document/product/436/36637)
- [COS + CDN 私有回源与鉴权](https://cloud.tencent.com/document/api/436/18669)
- [COS 成本优化和标准存储价格示例](https://cloud.tencent.com/document/product/436/50201)
- [CDN 计费常见问题](https://cloud.tencent.com/document/product/228/43799)
- [CDN URL 时间戳鉴权](https://intl.cloud.tencent.com/zh/document/product/228/35237)
- [CDN 用量封顶](https://cloud.tencent.com/document/product/228/41733)
- [COS 开启 CDN 的备案要求](https://intl.cloud.tencent.com/document/product/436/18670?lang=zh)
- [腾讯云 ICP 备案云资源要求](https://cloud.tencent.com/document/product/243/18908)
