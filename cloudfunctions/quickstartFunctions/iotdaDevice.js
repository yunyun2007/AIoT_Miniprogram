/**
 * 华为云IoTDA设备数据查询云函数
 * 使用Access Key获取IAM Token，再访问IoTDA设备数据
 */

const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 云函数配置
const IOTDA_CONFIG = {
  region: 'cn-east-1',
  brokerUrl: 'iotda.cn-east-1.myhuaweicloud.com',
  iamEndpoint: 'iam.cn-east-1.myhuaweicloud.com'
};

// 临时配置存储
let tempConfig = {
  deviceId: '',
  deviceSecret: '',
  projectId: '',
  accessKeyId: '',
  accessSecret: ''
};

// 生成签名
function generateSignature(stringToSign, secretAccessKey) {
  const hmac = crypto.createHmac('sha256', secretAccessKey);
  hmac.update(stringToSign);
  return hmac.digest('base64');
}

// 生成Authorization头
function generateAuthorization(accessKeyId, secretAccessKey, timestamp) {
  const stringToSign = `ANOTFY2IOSERVICEIOTDA${timestamp}`;
  const signature = generateSignature(stringToSign, secretAccessKey);
  return `ANOTFY2IOSERVICEIOTDA AccessKeyId=${accessKeyId}, Signature=${signature}`;
}

// 获取IAM Token (简化版，使用Basic Token)
async function getIAMToken() {
  const { accessKeyId, accessSecret } = tempConfig;

  if (!accessKeyId || !accessSecret) {
    throw new Error('请先配置Access Key');
  }

  // 生成签名日期
  const date = new Date();
  const timestamp = date.toISOString().replace(/\.\d{3}z$/, 'z');

  // 生成Authorization
  const authorization = generateAuthorization(accessKeyId, accessSecret, timestamp);

  const data = JSON.stringify({
    auth: {
      identity: {
        methods: ['accesskey'],
        accesskey: {
          accessKey: accessKeyId,
          secretKey: accessSecret
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
        'X-Security-Token': authorization,
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
          // 尝试解析错误信息
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
  return new Promise((resolve, reject) => {
    const options = {
      hostname: IOTDA_CONFIG.brokerUrl,
      port: 443,
      path: `/v5/iot/${projectId}/devices/${deviceId}/properties`,
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

// 云函数入口
exports.main = async (event, context) => {
  const { action, deviceId, deviceSecret, projectId, accessKeyId, accessSecret } = event;

  try {
    switch (action) {
      case 'setConfig':
        // 保存配置
        tempConfig.deviceId = deviceId;
        tempConfig.deviceSecret = deviceSecret;
        tempConfig.projectId = projectId;
        if (accessKeyId) tempConfig.accessKeyId = accessKeyId;
        if (accessSecret) tempConfig.accessSecret = accessSecret;
        return { success: true, message: '配置已更新' };

      case 'getDeviceData':
        // 获取设备数据
        if (!tempConfig.deviceId || !tempConfig.projectId) {
          return { success: false, error: '请先配置设备信息' };
        }
        if (!tempConfig.accessKeyId || !tempConfig.accessSecret) {
          return { success: false, error: '请先配置Access Key' };
        }

        const token = await getIAMToken();
        const data = await getDeviceProperties(tempConfig.deviceId, tempConfig.projectId, token);
        return { success: true, data };

      case 'getDeviceProperties':
        // 获取设备属性
        if (!deviceId || !projectId) {
          return { success: false, error: '缺少deviceId或projectId' };
        }
        if (!tempConfig.accessKeyId || !tempConfig.accessSecret) {
          return { success: false, error: '请先配置Access Key' };
        }

        const token2 = await getIAMToken();
        const props = await getDeviceProperties(deviceId, projectId, token2);
        return { success: true, data: props };

      default:
        return { success: false, error: '未知操作' };
    }
  } catch (error) {
    console.error('IoTDA Error:', error);
    return { success: false, error: error.message };
  }
};
