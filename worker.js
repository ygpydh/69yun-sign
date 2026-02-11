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

        // 防止浏览器图标请求误触
        if (url.pathname == "/favicon.ico") return new Response(null, { status: 204 });

        // === 新增：手动签到路由 ===
        if (url.pathname == "/sign") {
            // 传入 "手动执行" 标记
            const result = await checkin("手动执行");
            return new Response(result, {
                status: 200,
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
            });
        }
        // ========================

        if (url.pathname == "/tg") {
            await sendMessage("测试消息：Telegram 通知配置正常！");
            return new Response("测试消息已发送，请检查 Telegram", { status: 200 });
        } 
        
        // 这是一个保底的路由，防止直接访问根目录报错，也可以用来做简单的连通性测试
        return new Response("服务正常运行中。请访问 /sign 进行手动签到，或访问 /tg 测试通知。", {
            status: 200,
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
        });
    },

    async scheduled(controller, env, ctx) {
        console.log('Cron job started');
        try {
            await initializeVariables(env);
            // 传入 "定时任务" 标记
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

    // 隐藏部分账号信息
    const safeUser = user ? (user.substring(0, 3) + "***" + user.substring(user.length - 3)) : "未设置";
    
    const 账号信息 = `地址: ${domain}\n账号: ${safeUser}`;
    
    // 获取北京时间
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const formattedTime = beijingTime.toISOString().replace('T', ' ').substring(0, 19);
    
    // 组合最终消息
    const text = `<b>📅 执行时间:</b> ${formattedTime}\n${账号信息}\n\n${msg}`;
    
    const url = `https://api.telegram.org/bot${BotToken}/sendMessage`;
    
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: ChatID,
                text: text,
                parse_mode: 'HTML' // 使用 HTML 模式以支持加粗等格式
            })
        });
    } catch (e) {
        console.error("Telegram 请求异常:", e);
    }
}

// 修改 checkin 函数，接收一个 triggerType 参数
async function checkin(triggerType = "未知触发") {
    try {
        if (!domain || !user || !pass) {
            throw new Error('环境变量未配置完整');
        }

        console.log(`[${triggerType}] 开始登录: ${domain}`);

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

        const loginJson = await loginResponse.json();
        
        // 获取 Cookie
        const cookieHeader = loginResponse.headers.get('set-cookie');
        const cookies = cookieHeader ? cookieHeader.split(',').map(c => c.split(';')[0]).join('; ') : "";

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
        let msg = "";
        
        try {
            const res = JSON.parse(checkinText);
            msg = res.msg;
            // 判断签到结果
            if (res.ret === 1 || checkinText.includes("已签到") || checkinText.includes("成功")) {
                签到结果 = `✅ <b>签到成功</b>\n信息: ${msg}`;
            } else {
                签到结果 = `⚠️ <b>签到提示</b>\n信息: ${msg}`;
            }
        } catch (e) {
            签到结果 = `❌ <b>签到失败</b>\n原因: 网站返回非JSON格式`;
        }

        // 在结果中加上触发方式
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
