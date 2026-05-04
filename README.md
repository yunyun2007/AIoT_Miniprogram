# 智能骑行伴侣

一款基于微信小程序的智能骑行辅助应用，配合 ESP32 硬件设备与华为云 IoTDA 平台，实现完整的骑行体验。

## 功能概览

### 1. 骑行记录（首页）
- **实时数据**：速度、里程、时长、平均速度、卡路里
- **手机 GPS**：使用手机 GPS 定位，5秒更新频率，模拟 ESP32 上传频率
- **轨迹记录**：记录骑行路线，结束后可查看
- **加速度传感器**：显示 IMU 数据（加速度 X/Y/Z、角速度、横滚/俯仰/偏航角）
- **碰撞检测**：实时监测异常加速度变化

### 2. 导航功能
- **路线规划**：支持骑行/步行模式
- **实时导航**：语音指令提示（直行、左转、右转等）
- **设备同步**：导航指令下发至 ESP32 设备显示

### 3. 数据分析
- **骑行历史**：累计里程、次数统计
- **AI 分析报告**：基于华为云 MAAS 大模型，生成骑行数据分析报告

### 4. 防盗模式
- **设备监控**：监控 ESP32 设备位置
- **异常提醒**：检测设备异常移动时推送通知

## 技术架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   微信小程序    │────▶│   云函数        │────▶│   华为云 IoTDA  │
│  (前端界面)     │     │ (quickstartFunctions) │     │   (设备管理)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │                        │
                              │                        ▼
                              │               ┌─────────────────┐
                              │               │   ESP32 设备    │
                              │               │   (传感器数据)   │
                              └───────────────┴─────────────────┘
                                    │
                                    ▼
                        ┌─────────────────┐
                        │  华为云 MAAS     │
                        │  (AI 分析)       │
                        └─────────────────┘
```

### 技术栈
- **小程序框架**：微信小程序 + Vant WeUI 组件库
- **后端服务**：微信云开发云函数
- **设备通信**：华为云 IoTDA (MQTT 协议)
- **AI 服务**：华为云 MAAS (DeepSeek-V4-Flash 模型)

## 目录结构

```
AIoT_Miniprogram/
├── cloudfunctions/
│   └── quickstartFunctions/
│       ├── index.js          # 云函数主逻辑（IoTDA、AI分析）
│       └── config.env        # API 密钥配置（已 gitignore）
├── miniprogram/
│   ├── pages/
│   │   ├── index/            # 首页（骑行记录）
│   │   ├── navigation/       # 导航页
│   │   ├── schedule/         # 课表页
│   │   ├── report/           # 数据报告页
│   │   ├── settings/         # 设置页
│   │   └── anti-theft/      # 防盗模式页
│   ├── services/
│   │   └── iotda/
│   │       └── mqtt-client.js  # IoTDA MQTT 客户端
│   └── app.js               # 小程序入口
├── info.md                  # 设备配置信息
└── README.md
```

## 配置说明

### 1. 华为云 IoTDA 配置（已硬编码在云函数中）

| 配置项 | 值 |
|--------|-----|
| 设备 ID | `69ae7ce618855b39c5010ef5_myArduino` |
| 项目 ID | `d62df77446b8430fb0e71b8303fb3f29` |
| IAM 用户名 | `tester_miniprogram` |
| IAM 密码 | `CyT12346` |

### 2. API 密钥（config.env）

```env
HUAWEI_MAAS_API_KEY=xP8iwxOzKudY1Mn2MPn7hNwImW2MwT3sVAepK1sRLl1S27OIJp3NudeGPZaI0hMGUPqVKwa9cDaEc2HOYuyFpg
```

### 3. 小程序隐私权限

需要配置以下权限：
- `scope.userLocation` - 位置信息
- 后台定位模式 (`requiredBackgroundModes: ["location"]`)

## 主要功能实现

### GPS 定位
- 使用手机 GPS 替代 ESP32 GPS
- 5 秒更新间隔 (`locationUpdateInterval: 5000`)
- 骑行开始头 1 秒位移忽略（防止初始漂移）
- 漂移过滤：距离小于 5 米视为无效

### 导航指令下发
- 主题：`$oc/devices/{device_id}/sys/events/down`
- JSON 格式：
```json
{
  "event_type": "NavigationCommand",
  "paras": {
    "navStatus": "navigating",
    "navInstruction": "左转",
    "navDistance": 200,
    "navDestination": "教学楼A"
  }
}
```

### AI 骑行分析
- 调用华为云 MAAS API (DeepSeek-V4-Flash)
- 分析维度：本次骑行表现、历史对比、改进建议、目标建议
- 报告格式：中文，300字以内

## 开发注意事项

1. **API 密钥保护**：`config.env` 已加入 `.gitignore`，不要提交到 Git
2. **云函数超时**：微信云函数默认 3 秒超时，HTTPS 请求可能超时
3. **跨域问题**：小程序前端不能直接调用华为云 API，需通过云函数中转
4. **设备配置**：`tempConfig` 硬编码在云函数中，更新后需重新部署

## 部署指南

### 云函数部署
1. 修改 `cloudfunctions/quickstartFunctions/config.env` 配置 API 密钥
2. 使用微信开发者工具上传云函数
3. ESP32 配置正确的 IoTDA 项目信息和设备 ID

### 小程序编译
1. 安装依赖：`npm install`
2. 微信开发者工具中打开项目
3. 勾选"使用 npm 模块"
4. 构建：`npm run build`

## 相关文档

- [微信云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/)
- [华为云 IoTDA 文档](https://support.huaweicloud.com/iotda/)
- [华为云 MAAS 文档](https://support.huaweicloud.com/maas/)
- [Vant WeUI 组件库](https://vant-contrib.gitee.io/vant-weapp/)