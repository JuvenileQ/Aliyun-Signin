/**
 * 阿里云盘自动签到脚本
 */
const axios = require('axios')
const core = require('@actions/core')
const updateAccesssTokenURL = 'https://auth.aliyundrive.com/v2/account/token'
const signinURL = 'https://member.aliyundrive.com/v1/activity/sign_in_list?_rx-s=mobile'
const rewardURL = 'https://member.aliyundrive.com/v1/activity/sign_in_reward?_rx-s=mobile'

// 获取 GitHub 环境变量
const getEnv = () => {
  try {
    const str = core.getInput('refresh_token');
    console.log('string',str);
    return str.replace(/，/g, ',').split(',');
  } catch (e) {
    throw '未获取到refreshToken环境变量'
  }
}


// 使用 refresh_token 更新 access_token
const updateAccesssToken = (queryBody, remark) => {
  const errorMessage = [remark, '更新 access_token 失败']
  return axios(updateAccesssTokenURL, {
    method: 'POST',
    data: queryBody,
    headers: {'Content-Type': 'application/json'}
  })
    .then(d => d.data)
    .then(d => {
      const {code, message, nick_name, access_token} = d

      if (code) {
        if (code === 'RefreshTokenExpired' || code === 'InvalidParameter.RefreshToken')
          errorMessage.push('refresh_token 已过期或无效')
        else errorMessage.push(message)
        return Promise.reject(errorMessage.join(','))
      }
      return {nick_name, access_token}
    })
    .catch(e => {
      errorMessage.push(e.message)
      return Promise.reject(errorMessage.join(','))
    })
}

// 签到列表
const sign_in = (access_token, remark) => {
  const sendMessage = [remark]
  return axios(signinURL, {
    method: 'POST',
    data: {isReward: false},
    headers: {Authorization: access_token, 'Content-Type': 'application/json'}
  })
    .then(d => d.data)
    .then(async json => {
      if (!json.success) {
        sendMessage.push('签到失败', json.message)
        return Promise.reject(sendMessage.join(','))
      }
      sendMessage.push('签到成功')

      const {signInLogs, signInCount} = json.result
      const currentSignInfo = signInLogs[signInCount - 1] // 当天签到信息
      sendMessage.push(`本月累计签到 ${signInCount} 天`)
      currentSignInfo.isReward && sendMessage.push(`今日签到获得${currentSignInfo.reward.name || ''}${currentSignInfo.reward.description || ''}`)

      // 未领取奖励列表
      const rewards = signInLogs.filter(
        v => v.status === 'normal' && !v.isReward
      )
      rewards.length && rewards.map(async reward => {
        const signInDay = reward.day
        try {
          const rewardInfo = await getReward(access_token, signInDay)
          sendMessage.push(
            `第${signInDay}天奖励领取成功: 获得${rewardInfo.name || ''}${
              rewardInfo.description || ''
            }`
          )
        } catch (e) {
          sendMessage.push(`第${signInDay}天奖励领取失败:`, e)
        }
      })

      return sendMessage.join(', ')
    })
    .catch(e => {
      sendMessage.push('签到失败', e.message)
      return Promise.reject(sendMessage.join(', '))
    })
}

// 领取奖励
const getReward = (access_token, signInDay) => {
  return axios(rewardURL, {
    method: 'POST',
    data: {signInDay},
    headers: {
      authorization: access_token,
      'Content-Type': 'application/json'
    }
  })
    .then(d => d.data)
    .then(json => {
      if (!json.success) {
        return Promise.reject(json.message)
      }
      return json.result
    })
}

!(() => {
  // 获取refreshToken
  let refreshTokenArray = getEnv()
  
  if (!refreshTokenArray.length) {
    console.log('未获取到refreshToken, 程序终止')
    throw '未获取到refreshToken, 程序终止'
  }

  const message = []
  refreshTokenArray.map(async (refreshToken, index) => {
    let remark = `账号${index + 1}`
    const queryBody = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }

    try {
      const {nick_name, access_token} = await updateAccesssToken(queryBody, remark)
      remark = `${remark}（${nick_name}）`
      const sendMessage = await sign_in(access_token, remark)
      message.push(sendMessage)

      console.log(sendMessage);
    } catch (e) {
      console.error(e, '\n')
      message.push(e)
    }
  })

  // console.log(`阿里云盘签到：\n${message.join('\n')}`)
})()
