const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

// ========== 原有功能 ==========
const db = cloud.database();

// 获取openid
const getOpenId = async () => {
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

// 获取小程序二维码
const getMiniProgramCode = async () => {
  const resp = await cloud.openapi.wxacode.get({
    path: 'pages/index/index',
  });
  const { buffer } = resp;
  const upload = await cloud.uploadFile({
    cloudPath: 'code.png',
    fileContent: buffer,
  });
  return upload.fileID;
};

// 创建集合
const createCollection = async () => {
  try {
    await db.createCollection('sales');
    await db.collection('sales').add({
      data: {
        region: '华东',
        city: '上海',
        sales: 11,
      },
    });
    await db.collection('sales').add({
      data: {
        region: '华东',
        city: '南京',
        sales: 11,
      },
    });
    await db.collection('sales').add({
      data: {
        region: '华南',
        city: '广州',
        sales: 22,
      },
    });
    await db.collection('sales').add({
      data: {
        region: '华南',
        city: '深圳',
        sales: 22,
      },
    });
    return { success: true };
  } catch (e) {
    return { success: true, data: 'create collection success' };
  }
};

// 查询数据
const selectRecord = async () => {
  return await db.collection('sales').get();
};

// 更新数据
const updateRecord = async (event) => {
  try {
    for (let i = 0; i < event.data.length; i++) {
      await db
        .collection('sales')
        .where({ _id: event.data[i]._id })
        .update({
          data: { sales: event.data[i].sales },
        });
    }
    return { success: true, data: event.data };
  } catch (e) {
    return { success: false, errMsg: e };
  }
};

// 新增数据
const insertRecord = async (event) => {
  try {
    const insertRecord = event.data;
    await db.collection('sales').add({
      data: {
        region: insertRecord.region,
        city: insertRecord.city,
        sales: Number(insertRecord.sales),
      },
    });
    return { success: true, data: event.data };
  } catch (e) {
    return { success: false, errMsg: e };
  }
};

// 删除数据
const deleteRecord = async (event) => {
  try {
    await db
      .collection('sales')
      .where({ _id: event.data._id })
      .remove();
    return { success: true };
  } catch (e) {
    return { success: false, errMsg: e };
  }
};

// ========== IoTDA功能 ==========
const IOTDA_CONFIG = {
  region: 'cn-east-3',
  brokerUrl: '1fc5f68721.st1.iotda-app.cn-east-3.myhuaweicloud.com',
  iamEndpoint: 'iam.cn-east-3.myhuaweicloud.com'
};

// 临时配置存储
let tempConfig = {
  deviceId: '',
  deviceSecret: '',
  projectId: '',
  iamUsername: '',
  iamPassword: ''
};

// 获取IAM Token（使用用户名密码认证）
async function getIAMToken() {
  const { iamUsername, iamPassword } = tempConfig;

  if (!iamUsername || !iamPassword) {
    throw new Error('请先配置IAM用户名和密码');
  }

  // 主账号用户名（domain name）
  const domainName = 'hid_eayx4-_zxfp59ql';

  const data = JSON.stringify({
    auth: {
      identity: {
        methods: ['password'],
        password: {
          user: {
            name: iamUsername,
            password: iamPassword,
            domain: {
              name: domainName  // 主账号用户名
            }
          }
        }
      },
      scope: {
        project: {
          name: IOTDA_CONFIG.region
        }
      }
    }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: IOTDA_CONFIG.iamEndpoint,
      port: 443,
      path: '/v3/auth/tokens',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const token = res.headers['x-subject-token'];
        if (token) {
          resolve(token);
        } else {
          try {
            const err = JSON.parse(body);
            reject(new Error(err.error?.message || '获取Token失败'));
          } catch {
            reject(new Error('获取IAM Token失败'));
          }
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    req.write(data);
    req.end();
  });
}

// 获取设备属性
async function getDeviceProperties(deviceId, projectId, token) {
  // 获取设备影子，然后从中提取属性
  return new Promise((resolve, reject) => {
    const options = {
      hostname: IOTDA_CONFIG.brokerUrl,
      port: 443,
      path: `/v5/iot/${projectId}/devices/${deviceId}/shadow`,
      method: 'GET',
      headers: {
        'X-Auth-Token': token,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (e) {
          reject(new Error('解析响应失败'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    req.end();
  });
}

// 更新设备影子（desired属性）
async function updateDeviceShadow(deviceId, projectId, token, desiredProps) {
  return new Promise((resolve, reject) => {
    // 先获取当前影子
    const getOptions = {
      hostname: IOTDA_CONFIG.brokerUrl,
      port: 443,
      path: `/v5/iot/${projectId}/devices/${deviceId}/shadow`,
      method: 'GET',
      headers: {
        'X-Auth-Token': token,
        'Content-Type': 'application/json'
      }
    };

    https.request(getOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const shadow = JSON.parse(body);
          const currentVersion = shadow.version || 0;

          // 构建更新请求
          const updateData = JSON.stringify({
            shadow: [{
              service_id: 'Arduino',
              desired: desiredProps
            }]
          });

          const putOptions = {
            hostname: IOTDA_CONFIG.brokerUrl,
            port: 443,
            path: `/v5/iot/${projectId}/devices/${deviceId}/shadow`,
            method: 'PUT',
            headers: {
              'X-Auth-Token': token,
              'Content-Type': 'application/json',
              'If-Match': `version=${currentVersion}`
            }
          };

          const putReq = https.request(putOptions, (putRes) => {
            let putBody = '';
            putRes.on('data', chunk => putBody += chunk);
            putRes.on('end', () => {
              if (putRes.statusCode === 200 || putRes.statusCode === 201) {
                resolve({ success: true, data: JSON.parse(putBody) });
              } else {
                reject(new Error(`更新影子失败: ${putRes.statusCode} ${putBody}`));
              }
            });
          });

          putReq.on('error', reject);
          putReq.setTimeout(15000, () => {
            putReq.destroy();
            reject(new Error('请求超时'));
          });
          putReq.write(updateData);
          putReq.end();
        } catch (e) {
          reject(new Error('解析影子响应失败: ' + e.message));
        }
      });
    }).on('error', reject).end();
  });
}

// IoTDA操作
const iotdaActions = {
  setConfig: (event) => {
    tempConfig.deviceId = event.deviceId || '';
    tempConfig.deviceSecret = event.deviceSecret || '';
    tempConfig.projectId = event.projectId || '';
    if (event.iamUsername) tempConfig.iamUsername = event.iamUsername;
    if (event.iamPassword) tempConfig.iamPassword = event.iamPassword;
    return { success: true, message: '配置已更新' };
  },

  getDeviceData: async () => {
    if (!tempConfig.deviceId || !tempConfig.projectId) {
      return { success: false, error: '请先配置设备信息' };
    }
    if (!tempConfig.iamUsername || !tempConfig.iamPassword) {
      return { success: false, error: '请先配置IAM用户名和密码' };
    }

    const token = await getIAMToken();
    const data = await getDeviceProperties(tempConfig.deviceId, tempConfig.projectId, token);
    return { success: true, data };
  },

  getDeviceProperties: async (event) => {
    if (!event.deviceId || !event.projectId) {
      return { success: false, error: '缺少deviceId或projectId' };
    }
    if (!tempConfig.iamUsername || !tempConfig.iamPassword) {
      return { success: false, error: '请先配置IAM用户名和密码' };
    }

    const token = await getIAMToken();
    const props = await getDeviceProperties(event.deviceId, event.projectId, token);
    return { success: true, data: props };
  },

  // 下发导航指令到设备
  setNavCommand: async (event) => {
    if (!tempConfig.deviceId || !tempConfig.projectId) {
      return { success: false, error: '请先配置设备信息' };
    }
    if (!tempConfig.iamUsername || !tempConfig.iamPassword) {
      return { success: false, error: '请先配置IAM用户名和密码' };
    }

    const { navInstruction, navDistance, navDestination, navLatitude, navLongitude, navStatus } = event;

    const desiredProps = {};
    if (navInstruction !== undefined) desiredProps.navInstruction = navInstruction;
    if (navDistance !== undefined) desiredProps.navDistance = navDistance;
    if (navDestination !== undefined) desiredProps.navDestination = navDestination;
    if (navLatitude !== undefined) desiredProps.navLatitude = navLatitude;
    if (navLongitude !== undefined) desiredProps.navLongitude = navLongitude;
    if (navStatus !== undefined) desiredProps.navStatus = navStatus;

    const token = await getIAMToken();
    const result = await updateDeviceShadow(tempConfig.deviceId, tempConfig.projectId, token, desiredProps);
    return { success: true, data: result };
  },

  // 设置设备属性
  setDeviceProperty: async (event) => {
    if (!tempConfig.deviceId || !tempConfig.projectId) {
      return { success: false, error: '请先配置设备信息' };
    }
    if (!tempConfig.iamUsername || !tempConfig.iamPassword) {
      return { success: false, error: '请先配置IAM用户名和密码' };
    }

    const { propertyName, propertyValue } = event;
    if (!propertyName) {
      return { success: false, error: '缺少属性名' };
    }

    const desiredProps = {};
    desiredProps[propertyName] = propertyValue;

    const token = await getIAMToken();
    const result = await updateDeviceShadow(tempConfig.deviceId, tempConfig.projectId, token, desiredProps);
    return { success: true, data: result };
  },

  // 发送防盗报警通知
  sendAntiTheftAlert: async (event) => {
    console.log('收到防盗报警请求:', event);

    // 这里可以调用微信订阅消息接口发送通知
    // 需要使用小程序的 AppID 和 APPSecret 获取 access_token
    // 然后调用订阅消息接口

    const { deviceId, latitude, longitude, timestamp } = event;

    // TODO: 调用微信订阅消息接口
    // 需要配置:
    // 1. 小程序 AppID 和 APPSecret（在环境变量或配置中）
    // 2. 模板消息 ID（在微信公众平台配置）

    console.log('防盗报警已记录:', {
      deviceId,
      latitude,
      longitude,
      time: new Date(timestamp).toLocaleString()
    });

    // 返回成功（实际发送需要配置微信接口）
    return {
      success: true,
      message: '报警已收到',
      data: {
        deviceId,
        latitude,
        longitude,
        time: new Date(timestamp).toISOString()
      }
    };
  }
};

// ========== AI分析功能 ==========
const fs = require('fs');
const path = require('path');

// 从config.env读取API Key
function getMinimaxApiKey() {
  try {
    const envPath = path.join(__dirname, 'config.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/MINIMAX_API_KEY=(.+)/);
    return match ? match[1].trim() : '';
  } catch (e) {
    return '';
  }
}

const AI_CONFIG = {
  minimaxApiKey: getMinimaxApiKey(),
  minimaxEndpoint: 'https://api.minimaxi.com/anthropic'
};

// 调用Minimax API生成骑行分析报告
async function callMinimaxAPI(prompt) {
  const data = JSON.stringify({
    model: 'anthropic Sonnet',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.minimaxi.com',
      port: 443,
      path: '/anthropic',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${AI_CONFIG.minimaxApiKey}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('Minimax API响应状态:', res.statusCode);
        console.log('Minimax API响应体:', body.substring(0, 500));
        try {
          const result = JSON.parse(body);
          if (result.content && result.content[0] && result.content[0].text) {
            resolve(result.content[0].text);
          } else if (result.error) {
            reject(new Error('API错误: ' + (result.error.message || JSON.stringify(result.error))));
          } else {
            reject(new Error('响应格式未知: ' + body.substring(0, 200)));
          }
        } catch (e) {
          reject(new Error('JSON解析失败: ' + body.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    req.write(data);
    req.end();
  });
}

// 生成骑行数据AI分析报告
async function generateRideAnalysis(rideRecords) {
  if (!rideRecords || rideRecords.length === 0) {
    return '暂无骑行数据，无法生成分析报告。请先完成一次骑行。';
  }

  // 按日期排序，取最近的数据
  const sorted = [...rideRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = sorted[0];

  // 计算历史统计数据
  const totalRides = sorted.length;
  const totalDistance = sorted.reduce((sum, r) => sum + (r.distance || 0), 0);
  const totalDuration = sorted.reduce((sum, r) => sum + (r.duration || 0), 0);
  const totalCalories = sorted.reduce((sum, r) => sum + (r.calories || 0), 0);
  const avgDistance = totalDistance / totalRides;
  const avgSpeed = sorted.reduce((sum, r) => sum + (r.avgSpeed || 0), 0) / totalRides;

  // 格式化单次骑行时长
  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}小时${m}分钟`;
    if (m > 0) return `${m}分钟${s}秒`;
    return `${s}秒`;
  };

  // 构建prompt
  const prompt = `你是一个专业的骑行数据分析助手。请分析以下骑行数据，生成一份简洁的中文骑行报告。

【本次骑行数据】
- 日期：${latest.date}
- 里程：${latest.distance} 公里
- 时长：${formatDuration(latest.duration)}
- 平均速度：${latest.avgSpeed || 0} km/h
- 消耗卡路里：${latest.calories || 0} 千卡

【历史统计】（基于${totalRides}次骑行记录）
- 历史平均里程：${avgDistance.toFixed(2)} km
- 历史平均速度：${avgSpeed.toFixed(1)} km/h
- 历史总里程：${totalDistance.toFixed(2)} km
- 历史总时长：${formatDuration(totalDuration)}
- 历史总消耗卡路里：${totalCalories} 千卡

请从以下方面分析：
1. 本次骑行表现评价（结合历史数据）
2. 与历史平均水平的对比（进步/退步）
3. 改进建议（速度控制、体力分配等）
4. 下次骑行目标建议

要求：报告简洁，300字以内，用分段标题组织。`;

  try {
    const report = await callMinimaxAPI(prompt);
    return report;
  } catch (error) {
    console.error('Minimax API调用失败:', error);
    throw error;
  }
}

// AI分析操作
const aiActions = {
  // 生成骑行分析报告
  analyzeRideData: async (event) => {
    // 检查API Key是否配置
    if (!AI_CONFIG.minimaxApiKey || AI_CONFIG.minimaxApiKey === 'YOUR_MINIMAX_API_KEY') {
      return { success: false, error: '请先配置Minimax API Key' };
    }

    try {
      const rideRecords = event.rideRecords || [];
      if (!rideRecords || rideRecords.length === 0) {
        return { success: false, error: '暂无骑行数据' };
      }
      const report = await generateRideAnalysis(rideRecords);
      return { success: true, data: { report, generatedAt: new Date().toISOString() } };
    } catch (error) {
      console.error('AI分析失败:', error);
      return { success: false, error: error.message };
    }
  }
};

// ========== 云函数入口 ==========
exports.main = async (event, context) => {
  // 先检查是否是AI分析操作
  if (event.action && aiActions[event.action]) {
    try {
      const result = await aiActions[event.action](event);
      return result;
    } catch (error) {
      console.error('AI分析Error:', error);
      return { success: false, error: error.message };
    }
  }

  // 检查是否是IoTDA相关操作
  if (event.action && iotdaActions[event.action]) {
    try {
      const result = await iotdaActions[event.action](event);
      return result;
    } catch (error) {
      console.error('IoTDA Error:', error);
      return { success: false, error: error.message };
    }
  }

  // 原有switch逻辑
  switch (event.type) {
    case 'getOpenId':
      return await getOpenId();
    case 'getMiniProgramCode':
      return await getMiniProgramCode();
    case 'createCollection':
      return await createCollection();
    case 'selectRecord':
      return await selectRecord();
    case 'updateRecord':
      return await updateRecord(event);
    case 'insertRecord':
      return await insertRecord(event);
    case 'deleteRecord':
      return await deleteRecord(event);
    default:
      return { success: false, error: '未知操作' };
  }
};
