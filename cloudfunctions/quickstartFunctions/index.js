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

// 临时配置存储（硬编码配置）
let tempConfig = {
  deviceId: '69ae7ce618855b39c5010ef5_myArduino',
  deviceSecret: '874f2bccd039c02e18e18aff8fdb1f06bd9f9c7d9c5906e6439a4227c532b0e6',
  projectId: 'd62df77446b8430fb0e71b8303fb3f29',
  iamUsername: 'tester_miniprogram',
  iamPassword: 'CyT12346'
};

// 汉字转Unicode（避免中文乱码）
function encodeChinese(str) {
  if (!str) return str;
  return str.replace(/[一-龥]/g, (match) => {
    return '\\u' + match.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

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

// 发送命令/事件到设备
async function sendCommandToDevice(deviceId, projectId, token, commandName, params) {
  return new Promise((resolve, reject) => {
    console.log('[Cloud] sendCommandToDevice 被调用');
    console.log('[Cloud] deviceId:', deviceId, 'projectId:', projectId, 'commandName:', commandName);
    console.log('[Cloud] params:', JSON.stringify(params));

    // 确保paras不为空
    if (!params || Object.keys(params).length === 0) {
      console.error('[Cloud] 参数为空，拒绝发送');
      return reject(new Error('参数不能为空'));
    }

    // 事件下发JSON格式
    const commandData = JSON.stringify({
      event_type: commandName,
      paras: params
    });
    console.log('[Cloud] 发送的数据:', commandData);

    const options = {
      hostname: IOTDA_CONFIG.brokerUrl,
      port: 443,
      path: `/v5/iot/${projectId}/devices/${deviceId}/commands`,
      method: 'POST',
      headers: {
        'X-Auth-Token': token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(commandData)
      }
    };

    console.log('[Cloud] 开始发送HTTPS请求');
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('[Cloud] 命令下发响应状态:', res.statusCode);
        console.log('[Cloud] 命令下发响应体:', body.substring(0, 500));
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve({ success: true, data: JSON.parse(body) });
        } else {
          reject(new Error(`命令下发失败: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', (e) => {
      console.error('[Cloud] HTTPS请求错误:', e.message);
      reject(e);
    });
    req.setTimeout(15000, () => {
      console.error('[Cloud] 请求超时');
      req.destroy();
      reject(new Error('请求超时'));
    });
    req.write(commandData);
    req.end();
    console.log('[Cloud] 请求已发送，等待响应');
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

  // 下发导航指令到设备（通过事件订阅主题）- 异步版本
  setNavCommand: async (event) => {
    console.log('[Cloud] setNavCommand被调用');
    console.log('[Cloud] event:', JSON.stringify(event));

    if (!tempConfig.deviceId || !tempConfig.projectId) {
      console.log('[Cloud] 错误: 设备信息未配置');
      return { success: false, error: '请先配置设备信息' };
    }
    if (!tempConfig.iamUsername || !tempConfig.iamPassword) {
      console.log('[Cloud] 错误: IAM用户名或密码未配置');
      return { success: false, error: '请先配置IAM用户名和密码' };
    }

    const { navInstruction, navDistance, navDestination, navLatitude, navLongitude, navStatus } = event;
    console.log('[Cloud] 收到导航参数 - navInstruction:', navInstruction, 'navDestination:', navDestination);

    // 封装导航参数，汉字转Unicode避免乱码
    const navParams = {};
    if (navInstruction !== undefined) navParams.navInstruction = encodeChinese(navInstruction);
    if (navDistance !== undefined) navParams.navDistance = navDistance;
    if (navDestination !== undefined) navParams.navDestination = encodeChinese(navDestination);
    if (navLatitude !== undefined) navParams.navLatitude = navLatitude;
    if (navLongitude !== undefined) navParams.navLongitude = navLongitude;
    if (navStatus !== undefined) navParams.navStatus = navStatus;

    console.log('[Cloud] 编码后的导航参数:', JSON.stringify(navParams));

    // 触发异步任务并等待完成（最多2秒）
    const tokenPromise = getIAMToken().then(token => {
      console.log('[Cloud] 获取Token成功，开始发送命令');
      return sendCommandToDevice(tempConfig.deviceId, tempConfig.projectId, token, 'NavigationCommand', navParams);
    }).then(result => {
      console.log('[Cloud] 导航指令发送成功, result:', JSON.stringify(result));
    }).catch(err => {
      console.error('[Cloud] 异步执行出错:', err.message);
    });

    // 等待异步任务完成（最多2秒）
    await Promise.race([
      tokenPromise,
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);

    console.log('[Cloud] 返回成功');
    return { success: true, message: '导航指令已发送' };
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

console.log('=== 云函数入口开始 ===');

// 从config.env读取API Key
function getHuaweiApiKey() {
  try {
    const envPath = path.join(__dirname, 'config.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/HUAWEI_MAAS_API_KEY=(.+)/);
    return match ? match[1].trim() : '';
  } catch (e) {
    return '';
  }
}

const AI_CONFIG = {
  huaweiApiKey: getHuaweiApiKey(),
  huaweiEndpoint: 'https://api.modelarts-maas.com/v2/chat/completions',
  model: 'deepseek-v4-flash'
};

// 调用华为云MAAS API生成骑行分析报告
async function callHuaweiMAAS(prompt) {
  const data = JSON.stringify({
    model: AI_CONFIG.model,
    messages: [
      { role: 'system', content: '你是一个专业的骑行数据分析助手，友善且专业。' },
      { role: 'user', content: prompt }
    ]
  });

  return new Promise((resolve, reject) => {
    console.log('开始请求华为MAAS API');
    console.log('API地址:', AI_CONFIG.huaweiEndpoint);
    console.log('Model:', AI_CONFIG.model);
    console.log('API Key前10位:', AI_CONFIG.huaweiApiKey.substring(0, 10));

    const url = new URL(AI_CONFIG.huaweiEndpoint);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${AI_CONFIG.huaweiApiKey}`
      }
    };

    console.log('发送请求...');
    const req = https.request(options, (res) => {
      console.log('收到响应，状态码:', res.statusCode);
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('响应数据长度:', body.length);
        console.log('华为MAAS API响应体前500字符:', body.substring(0, 500));
        try {
          const result = JSON.parse(body);
          if (result.choices && result.choices[0] && result.choices[0].message) {
            resolve(result.choices[0].message.content);
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

    req.on('error', (e) => {
      console.log('请求错误:', e.message);
      reject(e);
    });
    req.setTimeout(10000, () => {
      console.log('请求超时');
      req.destroy();
      reject(new Error('请求超时'));
    });
    req.write(data);
    req.end();
    console.log('请求已发送');
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
    const report = await callHuaweiMAAS(prompt);
    return report;
  } catch (error) {
    console.error('华为MAAS API调用失败:', error);
    throw error;
  }
}

// AI分析操作
const aiActions = {
  // 生成骑行分析报告
  analyzeRideData: async (event) => {
    // 检查API Key是否配置
    if (!AI_CONFIG.huaweiApiKey) {
      return { success: false, error: '请先配置华为云MAAS API Key' };
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

// 云函数入口
exports.main = async (event, context) => {
  console.log('=== 云函数被调用 ===');
  console.log('event:', JSON.stringify(event).substring(0, 200));

  // 先检查是否是AI分析操作
  if (event.action && aiActions[event.action]) {
    try {
      console.log('执行AI分析 action:', event.action);
      const result = await aiActions[event.action](event);
      console.log('AI分析结果:', JSON.stringify(result).substring(0, 200));
      return result;
    } catch (error) {
      console.error('AI分析Error:', error.message);
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
