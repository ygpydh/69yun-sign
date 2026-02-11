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

        if (url.pathname == "/favicon.ico") return new Response(null, { status: 204 });

        if (url.pathname == "/sign") {
            const result = await checkin("手动执行");
            return new Response(result, {
                status: 200,
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
            });
        }

        if (url.pathname == "/tg") {
            await sendMessage("测试消息：Telegram 通知配置正常！");
            return new Response("测试消息已发送，请检查 Telegram", { status: 200 });
        } 
        
        return new Response("服务正常运行中。请访问 /sign 进行手动签到，或访问 /tg 测试通知。", {
            status: 200,
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
        });
    },

    async scheduled(controller, env, ctx) {
        console.log('Cron job started');
        try {
            await initializeVariables(env);
            await checkin("定时任务");
            console.log('Cron job completed successfully');
        } catch (error) {
            console.error('Cron job failed:', error);
            签到结果 = `❌ 定时任务执行失败: ${error.message}`;
            await sendMessage(签到结果);
        }
    },
};

async function initializeVariables(env) {
    domain = env.JC || env.DOMAIN || domain;
    user = env.ZH || env.USER || user;
    pass = env.MM || env.PASS || pass;
    
    if (domain && !domain.startsWith("http")) domain = `https://${domain}`;
    if (domain && domain.endsWith("/")) domain = domain.slice(0, -1);

    BotToken = env.TGTOKEN || BotToken;
    ChatID = env.TGID || ChatID;
}

async function sendMessage(msg = "") {
    if (!BotToken || !ChatID) {
        console.log("未配置 TGTOKEN 或 TGID，跳过发送通知");
        return;
    }

    // 调用新的等长打码函数
    const safeUser = maskEmailSameLength(user);
    
    const 账号信息 = `地址: ${domain}\n账号: ${safeUser}`;
    
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const formattedTime = beijingTime.toISOString().replace('T', ' ').substring(0, 19);
    
    const text = `<b>📅 执行时间:</b> ${formattedTime}\n${账号信息}\n\n${msg}`;
    
    const url = `https://api.telegram.org/bot${BotToken}/sendMessage`;
    
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: ChatID,
                text: text,
                parse_mode: 'HTML'
            })
        });
    } catch (e) {
        console.error("Telegram 请求异常:", e);
    }
}

async function checkin(triggerType = "未知触发") {
    try {
        if (!domain || !user || !pass) {
            throw new Error('环境变量未配置完整');
        }

        console.log(`[${triggerType}] 开始登录: ${domain}`);

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

        const cookieHeader = loginResponse.headers.get('set-cookie');
        const cookies = cookieHeader ? cookieHeader.split(',').map(c => c.split(';')[0]).join('; ') : "";

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
        let msg = "";
        
        try {
            const res = JSON.parse(checkinText);
            msg = res.msg;
            if (res.ret === 1 || checkinText.includes("已签到") || checkinText.includes("成功")) {
                签到结果 = `✅ <b>签到成功</b>\n信息: ${msg}`;
            } else {
                签到结果 = `⚠️ <b>签到提示</b>\n信息: ${msg}`;
            }
        } catch (e) {
            签到结果 = `❌ <b>签到失败</b>\n原因: 网站返回非JSON格式`;
        }

        const finalMsg = `<b>🚀 触发方式:</b> ${triggerType}\n${签到结果}`;
        
        await sendMessage(finalMsg);
        return `[${triggerType}] 执行完毕：\n${msg}`;

    } catch (error) {
        console.error('Checkin Error:', error);
        const errorMsg = `❌ <b>执行出错</b>\n原因: ${error.message}`;
        const finalMsg = `<b>🚀 触发方式:</b> ${triggerType}\n${errorMsg}`;
        await sendMessage(finalMsg);
        return error.message;
    }
}

// === 最终版：等长随机打码函数 ===
function maskEmailSameLength(email) {
    if (!email || !email.includes('@')) return email || "未设置";
    
    const [name, domain] = email.split('@');
    const len = name.length;

    // 1. 账号极短 (<=2位)，保留第一位，第二位打码 (保持长度)
    // ab -> a*
    if (len <= 2) return name[0] + "*@" + domain;

    // 2. 账号较短 (3-4位)，保留第一位，最后一位随机显隐，中间填满星号
    // abc -> a*c 或 a**
    if (len <= 4) {
        const keepEnd = Math.random() > 0.5; // 50% 概率保留最后一位
        if (keepEnd) {
            return name[0] + "*".repeat(len - 2) + name[len - 1] + "@" + domain;
        } else {
            return name[0] + "*".repeat(len - 1) + "@" + domain;
        }
    }

    // 3. 正常长度账号 (>4位)
    // 随机决定保留开头几个字符 (2 到 长度的一半)
    const keepStartCount = 2 + Math.floor(Math.random() * (Math.floor(len / 2) - 1));
    
    // 随机决定保留结尾几个字符 (0 到 2 个)
    // 0 = 尾巴全码，1 = 露1个尾巴，2 = 露2个尾巴
    const keepEndCount = Math.floor(Math.random() * 3); 

    // 计算中间需要填多少个星号
    const starCount = len - keepStartCount - keepEndCount;

    // 拼接
    const startStr = name.substring(0, keepStartCount);
    const endStr = keepEndCount > 0 ? name.substring(len - keepEndCount) : "";
    
    return startStr + "*".repeat(starCount) + endStr + "@" + domain;
}
