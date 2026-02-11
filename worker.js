let domain = "这里填机场域名";
let user = "这里填邮箱";
let pass = "这里填密码";
let 签到结果;
let BotToken = '';
let ChatID = '';

export default {
    async fetch(request, env, ctx) {
        await initializeVariables(env);
        const url = new URL(request.url);
        // 增加路由判断，防止浏览器图标请求触发脚本
        if (url.pathname == "/favicon.ico") return new Response(null, { status: 204 });

        if (url.pathname == "/tg") {
            await sendMessage("测试消息：Telegram 通推配置正常！");
        } else if (url.pathname == `/${pass}`) {
            await checkin();
        }
        return new Response(签到结果 || "请检查路径或执行定时任务", {
            status: 200,
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
        });
    },

    async scheduled(controller, env, ctx) {
        console.log('Cron job started');
        try {
            await initializeVariables(env);
            await checkin();
            console.log('Cron job completed successfully');
        } catch (error) {
            console.error('Cron job failed:', error);
            签到结果 = `定时任务执行失败: ${error.message}`;
            await sendMessage(签到结果);
        }
    },
};

async function initializeVariables(env) {
    // 优先读取环境变量
    domain = env.JC || env.DOMAIN || domain;
    user = env.ZH || env.USER || user;
    pass = env.MM || env.PASS || pass;
    
    // 确保域名格式正确
    if (domain && !domain.startsWith("http")) domain = `https://${domain}`;
    // 去除域名末尾的斜杠
    if (domain && domain.endsWith("/")) domain = domain.slice(0, -1);

    BotToken = env.TGTOKEN || BotToken;
    ChatID = env.TGID || ChatID;

    // 遮掩敏感信息用于日志展示
    const safeDomain = domain ? (domain.substring(0, 9) + "****" + domain.substring(domain.length - 5)) : "未设置";
    const safeUser = user ? (user.substring(0, 1) + "****" + user.substring(user.length - 5)) : "未设置";
    
    签到结果 = `地址: ${safeDomain}\n账号: ${safeUser}\n\nTG推送: ${ChatID ? "已启用" : "未启用"}`;
}

async function sendMessage(msg = "") {
    // 检查 Token 和 ID 是否存在
    if (!BotToken || !ChatID) {
        console.log("未配置 TGTOKEN 或 TGID，跳过发送通知");
        return;
    }

    const 账号信息 = `地址: ${domain}\n账号: ${user}`;
    const now = new Date();
    // 调整为北京时间
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const formattedTime = beijingTime.toISOString().replace('T', ' ').substring(0, 19);
    
    console.log("准备发送消息:", msg);
    
    const text = `执行时间: ${formattedTime}\n${账号信息}\n\n${msg}`;
    // 使用官方 API
    const url = `https://api.telegram.org/bot${BotToken}/sendMessage`;
    
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: ChatID,
                text: text,
                parse_mode: 'HTML'
            })
        });
        
        const resJson = await resp.json();
        if (!resJson.ok) {
            console.error("Telegram 消息发送失败:", resJson);
        } else {
            console.log("Telegram 消息发送成功");
        }
        return resp;
    } catch (e) {
        console.error("Telegram 请求异常:", e);
    }
}

async function checkin() {
    try {
        if (!domain || !user || !pass) {
            throw new Error('环境变量 JC(域名), ZH(账号), MM(密码) 未配置');
        }

        console.log(`正在登录: ${domain}`);

        // 1. 登录
        const loginResponse = await fetch(`${domain}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
                'Origin': domain,
                'Referer': `${domain}/auth/login`,
            },
            body: JSON.stringify({
                email: user,
                passwd: pass,
                remember_me: 'on',
                code: "",
            }),
        });

        if (!loginResponse.ok) throw new Error(`登录请求状态码异常: ${loginResponse.status}`);
        
        const loginJson = await loginResponse.json();
        console.log('登录结果:', loginJson);

        if (loginJson.ret !== 1) {
            // 尝试直接签到，防止其实已经登录但返回非1的情况
            console.log("登录返回非成功状态，尝试继续流程..."); 
        }

        // 获取 Cookie (关键步骤)
        const cookieHeader = loginResponse.headers.get('set-cookie');
        // 部分站点可能不需要set-cookie即可签到，但大多数需要
        const cookies = cookieHeader ? cookieHeader.split(',').map(c => c.split(';')[0]).join('; ') : "";
        console.log('获取到的 Cookies:', cookies);

        // 2. 签到
        const checkinResponse = await fetch(`${domain}/user/checkin`, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
                'Origin': domain,
                'Referer': `${domain}/user/panel`,
                'Content-Type': 'application/json'
            },
        });

        const checkinText = await checkinResponse.text();
        console.log('签到原始返回:', checkinText);
        
        let msg = "";
        try {
            const res = JSON.parse(checkinText);
            // ret 1: 成功, ret 0: 失败(通常是已签到), 其他: 错误
            msg = res.msg;
            if (res.ret === 1 || checkinText.includes("已签到") || checkinText.includes("成功")) {
                签到结果 = `✅ 签到成功\n信息: ${msg}`;
            } else {
                签到结果 = `⚠️ 签到提示\n信息: ${msg}`;
            }
        } catch (e) {
            // 如果返回不是JSON，可能是报错页面
            签到结果 = `❌ 签到解析失败: 返回内容不是 JSON (可能是网站开启了 Cloudflare 盾或服务不可用)`;
        }

        await sendMessage(签到结果);
        return 签到结果;

    } catch (error) {
        console.error('Checkin Error:', error);
        签到结果 = `❌ 脚本执行出错: ${error.message}`;
        await sendMessage(签到结果);
        return 签到结果;
    }
}
