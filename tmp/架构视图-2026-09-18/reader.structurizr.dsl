workspace "原文阅读器 READER" "C4 模型 · 证据来自 2026-09-18 静态扫描（31 模块 / 144 import 边 / 0 环 / L0-L12）。实线=编译期 import，虚线=运行期共享状态读写（import 图不可见）。" {
    !identifiers hierarchical

    model {
        reader = person "读者" "在浏览器中打开本地页面，加载一本 .txt 长文并自动/手动滚动阅读。"

        fileServer = softwareSystem "本地静态文件服务" "以 HTTP 目录列表方式暴露 ./txt/ 下的 .txt 正文。无 API、无 manifest，依赖服务器的 HTML listing。" {
            tags "External"
        }

        voiceServer = softwareSystem "声音远程服务器" "本地 wss://localhost:15941，自签名证书，需先在浏览器信任 https://localhost:15941。做语音转写并回传流式文本。地址与房间可被 URL 参数 ?ws= / ?room= 覆盖。" {
            tags "External"
        }

        readerApp = softwareSystem "原文阅读器 READER" "零构建纯原生 JS 长文阅读器：虚拟渲染、自适应自动滚动、关键词与搭配分析、阅读统计。" {

            browserDoc = container "浏览器文档（单页）" "同一 document 内以两个 type=module 脚本启动：app.js 为主装配根，语音订阅.js 为隔离入口。" "Native ES Modules / 零构建 / 无运行时依赖" {

                compositionRoot = component "装配根 app.js" "1186 行。import 26 个模块（全图最高扇出），注入 4 处断环回调，写 32 处共享状态。是 composition root、状态写入中心和断环中心。" "ES Module" {
                    tags "Entry,HiddenDataWriter"
                }

                voiceEntry = component "语音订阅入口 语音订阅.js" "仅 import 常量.js，爆炸半径 0，与主链路完全隔离的第二入口。" "ES Module" {
                    tags "Entry"
                }

                sharedKernel = component "共享内核" "常量.js(197行,半径29,I=0)、状态.js(381行,可变单例,半径22)、文本工具.js、调度.js、阅读统计.js。被 21 个模块 import。" "ES Module" {
                    tags "Kernel"
                }

                layoutRender = component "排版与虚拟渲染" "排版引擎.js、虚拟渲染.js、文本管线.js、章节目录.js、章节索引.js。重建行索引/句段前缀和，按窗口增删行。" "ES Module" {
                    tags "Core"
                }

                scrollMotion = component "滚动与跳转" "自动滚动.js(rAF 主循环)、滚动条.js、跳转动画.js。含两条并行 rAF 与 sub-pixel transform 补偿。" "ES Module" {
                    tags "Core"
                }

                keywordSearch = component "关键词与查找" "关键词.js、关键词手势.js、搜索.js、查找弹窗.js、词频弹窗.js。词频/搭配/上下文分析。" "ES Module" {
                    tags "Feature"
                }

                interactionShell = component "交互外壳" "正文交互.js、键盘控制.js、面板.js、字体设置.js、内容选择弹窗.js、右下控件.js、指示器.js。" "ES Module" {
                    tags "Feature"
                }

                persistTelemetry = component "持久化与观测" "持久化.js、统计展示.js、前台停留.js、错误提示.js。" "ES Module" {
                    tags "Support"
                }
            }

            store = container "localStorage" "读写偏好、关键词列表、查找历史、阅读进度；含损坏快照备份键。" "Web Storage" {
                tags "Database"
            }
        }

        // ---------- System Context 层 ----------
        reader -> readerApp "打开页面、选书、滚动与点选关键词" "Browser"
        readerApp -> fileServer "拉取 ./txt/ 目录列表与所选 .txt 正文" "HTTP (cache: no-store)"
        readerApp -> voiceServer "接收读者语音指令（翻页 / 调速）" "WebSocket (wss, 自签名证书)"

        // ---------- Container 层 ----------
        readerApp.browserDoc -> readerApp.store "读写序列化后的状态快照" "Web Storage API"
        readerApp.browserDoc -> fileServer "fetch 正文与目录" "HTTP" {
            tags "Sync"
        }
        readerApp.browserDoc -> voiceServer "建立长连接收流式转写文本；断开每 5s 重连，最多 2 次后放弃" "WebSocket wss://localhost:15941" {
            tags "Async"
        }

        // ---------- window 事件总线（既非 import 也非共享状态）----------
        readerApp.browserDoc.voiceEntry -> readerApp.browserDoc.compositionRoot "派发 window CustomEvent 语音翻页/语音自动滚动；app.js 监听。二者无 import，仅共享 常量.js 的 语音事件" "window CustomEvent" {
            tags "EventBus"
        }

        // ---------- Component 层：编译期 import（实线）----------
        readerApp.browserDoc.compositionRoot -> readerApp.browserDoc.layoutRender "启动时装配并触发首次排版" "import" {
            tags "Import"
        }
        readerApp.browserDoc.compositionRoot -> readerApp.browserDoc.scrollMotion "注册自动滚动与滚轮钩子" "import" {
            tags "Import"
        }
        readerApp.browserDoc.compositionRoot -> readerApp.browserDoc.keywordSearch "装配查找/词频弹窗" "import" {
            tags "Import"
        }
        readerApp.browserDoc.compositionRoot -> readerApp.browserDoc.interactionShell "绑定键盘/正文/面板交互" "import" {
            tags "Import"
        }
        readerApp.browserDoc.compositionRoot -> readerApp.browserDoc.persistTelemetry "初始化持久化与错误提示" "import" {
            tags "Import"
        }
        readerApp.browserDoc.compositionRoot -> readerApp.browserDoc.sharedKernel "import 常量与状态单例" "import" {
            tags "Import"
        }
        readerApp.browserDoc.voiceEntry -> readerApp.browserDoc.sharedKernel "仅 import 常量.js" "import" {
            tags "Import"
        }

        readerApp.browserDoc.scrollMotion -> readerApp.browserDoc.layoutRender "二分句段起点 / 渲染可见行" "import" {
            tags "Import"
        }
        readerApp.browserDoc.keywordSearch -> readerApp.browserDoc.layoutRender "读取行索引与文本切片" "import" {
            tags "Import"
        }
        readerApp.browserDoc.interactionShell -> readerApp.browserDoc.keywordSearch "键盘/手势驱动查找与词频" "import" {
            tags "Import"
        }
        readerApp.browserDoc.interactionShell -> readerApp.browserDoc.scrollMotion "键盘触发自动滚动" "import" {
            tags "Import"
        }
        readerApp.browserDoc.interactionShell -> readerApp.browserDoc.layoutRender "字体设置后重建索引" "import" {
            tags "Import"
        }
        readerApp.browserDoc.layoutRender -> readerApp.browserDoc.persistTelemetry "排版失败经错误提示上报" "import" {
            tags "Import"
        }
        readerApp.browserDoc.layoutRender -> readerApp.browserDoc.sharedKernel "import 常量/状态/调度" "import" {
            tags "Import"
        }
        readerApp.browserDoc.scrollMotion -> readerApp.browserDoc.sharedKernel "import 常量/状态/持久化" "import" {
            tags "Import"
        }
        readerApp.browserDoc.keywordSearch -> readerApp.browserDoc.sharedKernel "import 常量/状态" "import" {
            tags "Import"
        }
        readerApp.browserDoc.interactionShell -> readerApp.browserDoc.sharedKernel "import 常量/状态" "import" {
            tags "Import"
        }
        readerApp.browserDoc.persistTelemetry -> readerApp.browserDoc.sharedKernel "import 常量/状态" "import" {
            tags "Import"
        }

        // ---------- Component 层：运行期共享状态反向数据流（虚线）----------
        // 实测 90 条，此处画层级跨度最大的代表边。它们都不是 import 边。
        readerApp.browserDoc.compositionRoot -> readerApp.browserDoc.layoutRender "写 状态.文本/句段起点列表/阶梯断点 供 L3 读取；L3 不 import L12" "in-memory 状态 单例" {
            tags "HiddenDataFlow"
        }
        readerApp.browserDoc.compositionRoot -> readerApp.browserDoc.persistTelemetry "写 状态.文件名 等供 L2/L4 读取" "in-memory 状态 单例" {
            tags "HiddenDataFlow"
        }
        readerApp.browserDoc.interactionShell -> readerApp.browserDoc.scrollMotion "字体设置.js(L8) 与 自动滚动.js(L8) 写 状态.行高/自动滚动速度" "in-memory 状态 单例" {
            tags "HiddenDataFlow"
        }
        readerApp.browserDoc.scrollMotion -> readerApp.browserDoc.layoutRender "自动滚动.js(L8) 写 状态.行起点列表 被 指示器.js(L6) 读取" "in-memory 状态 单例" {
            tags "HiddenDataFlow"
        }
    }

    views {
        systemLayout readerApp "SystemContext" "读者与系统边界：一个本地静态站点，唯一外部依赖是同域文件服务。" {
            include *
            autoLayout lr
        }

        container readerApp "Containers" "容器层：单个浏览器文档 + localStorage，无后端、无构建产物。" {
            include *
            autoLayout lr
        }

        component readerApp.browserDoc "Components" "组件层：29 个 js/ 模块按职责归入 8 组（每组的成员清单见 description）。实线=import，虚线=运行期共享状态反向耦合。逐模块的精确依赖见 dependency-map.dot。" {
            include *
            autoLayout tb
        }

        styles {
            element "Person" {
                shape person
                background #08427b
                color #ffffff
            }
            element "External" {
                background #999999
                color #ffffff
            }
            element "Database" {
                shape cylinder
                background #2f6b4f
                color #ffffff
            }
            element "Entry" {
                background #b71540
                color #ffffff
            }
            element "Kernel" {
                background #1b4f72
                color #ffffff
            }
            element "Core" {
                background #2874a6
                color #ffffff
            }
            element "Feature" {
                background #7fb3d5
                color #000000
            }
            element "Support" {
                background #d6dbaf
                color #000000
            }
            relationship "Import" {
                style solid
                thickness 2
                color #2e4053
            }
            relationship "EventBus" {
                style dashed
                thickness 2
                color #148f77
            }
            relationship "HiddenDataFlow" {
                style dashed
                thickness 3
                color #cb4335
                rounded true
            }
        }
    }
}
