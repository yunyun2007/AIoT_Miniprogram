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
              service_id: 'Navigation',
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
  }
};

// ========== 云函数入口 ==========
exports.main = async (event, context) => {
  // 先检查是否是IoTDA相关操作
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
