const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages
    ]
});

const serverConfigs = new Map();
const scheduledNotifications = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('Bot is ready to use!');
    checkUpcomingEvents();
    checkExistingEvents();
});

// 기존 이벤트 체크
async function checkExistingEvents() {
    client.guilds.cache.forEach(async guild => {
        const events = await guild.scheduledEvents.fetch();
        events.forEach(event => {
            scheduledNotifications.set(event.id, { thirtyMinNotified: false });
        });
    });
}

// 서버 참여시 기존 이벤트 체크
client.on('guildCreate', async guild => {
    const events = await guild.scheduledEvents.fetch();
    events.forEach(event => {
        scheduledNotifications.set(event.id, { thirtyMinNotified: false });
    });
});

function checkUpcomingEvents() {
    setInterval(async () => {
        const now = Date.now();
        scheduledNotifications.forEach(async (notified, eventId) => {
            const guilds = client.guilds.cache;
            let event = null;

            for (const [, guild] of guilds) {
                event = await guild.scheduledEvents.fetch(eventId).catch(() => null);
                if (event) break;
            }

            if (!event) {
                scheduledNotifications.delete(eventId);
                return;
            }

            const timeUntilEvent = event.scheduledStartTimestamp - now;
            // 30분 전 (허용 오차 1분)
            if (timeUntilEvent <= 1800000 && timeUntilEvent > 1740000 && !notified.thirtyMinNotified) {
                sendEventReminder(event, '30분');
                notified.thirtyMinNotified = true;
            }
        });
    }, 60000);
}

async function sendEventReminder(event, timeLeft) {
    const channelId = serverConfigs.get(event.guildId);
    if (!channelId) return;

    try {
        const channel = await client.channels.fetch(channelId);
        const reminderEmbed = new EmbedBuilder()
            .setColor('#FF9300')
            .setTitle('⏰ 이벤트 시작 알림')
            .setDescription(`**${event.name}** 이벤트가 ${timeLeft} 후에 시작됩니다!`)
            .addFields(
                { name: '시작 시간', value: `<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: '이벤트에 참여하시려면 위 제목을 클릭하세요!' })
            .setTimestamp();

        await channel.send({
            content: `@everyone 잊지 마세요!`,
            embeds: [reminderEmbed]
        });
    } catch (error) {
        console.error('Error sending event reminder:', error);
    }
}

client.on('messageCreate', async message => {
    if (!message.guild) return;

    if (message.content.startsWith('!seteventchannel')) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('이 명령어를 사용하려면 서버 관리 권한이 필요합니다.');
        }

        serverConfigs.set(message.guildId, message.channel.id);
        message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ 설정 완료')
                    .setDescription('이벤트 알림 채널이 설정되었습니다!')
                    .addFields(
                        { name: '채널', value: `<#${message.channel.id}>` }
                    )
                    .setTimestamp()
            ]
        });
    }

    if (message.content === '!eventhelp') {
        message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('📚 이벤트 봇 도움말')
                    .setDescription('이벤트 알림 봇 사용 방법입니다.')
                    .addFields(
                        { name: '!seteventchannel', value: '현재 채널을 이벤트 알림 채널로 설정합니다.\n(서버 관리 권한 필요)', inline: false },
                        { name: '자동 알림', value: '• 새 이벤트 생성 시 알림\n• 이벤트 시작 30분 전 알림', inline: false }
                    )
                    .setFooter({ text: '추가 문의: 봇 개발자에게 문의하세요' })
            ]
        });
    }
});

client.on(Events.GuildScheduledEventCreate, async scheduledEvent => {
    const guildId = scheduledEvent.guildId;
    const channelId = serverConfigs.get(guildId);

    if (!channelId) {
        console.log(`No event channel set for guild ${guildId}`);
        return;
    }

    try {
        const channel = await client.channels.fetch(channelId);

        const eventEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎉 새로운 이벤트가 등록되었습니다!')
            .setDescription(`# ${scheduledEvent.name}\n\n`)
            .addFields(
                { name: '\u200B', value: '\u200B' },
                {
                    name: '📅 시작 시간',
                    value: `<t:${Math.floor(scheduledEvent.scheduledStartTimestamp / 1000)}:F>\n(<t:${Math.floor(scheduledEvent.scheduledStartTimestamp / 1000)}:R>)`,
                    inline: false
                },
                { name: '\u200B', value: '\u200B' }
            );

        if (scheduledEvent.scheduledEndTimestamp) {
            eventEmbed.addFields({
                    name: '⏰ 종료 시간',
                    value: `<t:${Math.floor(scheduledEvent.scheduledEndTimestamp / 1000)}:F>`,
                    inline: false
                },
                { name: '\u200B', value: '\u200B' });
        }

        if (scheduledEvent.description) {
            eventEmbed.addFields({
                    name: '📝 설명',
                    value: scheduledEvent.description,
                    inline: false
                },
                { name: '\u200B', value: '\u200B' });
        }

        if (scheduledEvent.entityMetadata?.location) {
            eventEmbed.addFields({
                    name: '📍 장소',
                    value: scheduledEvent.entityMetadata.location,
                    inline: false
                },
                { name: '\u200B', value: '\u200B' });
        }

        eventEmbed
            .setURL(`https://discord.com/events/${scheduledEvent.guildId}/${scheduledEvent.id}`)
            .setFooter({ text: '이벤트에 참여하시려면 위 제목을 클릭하세요!' })
            .setTimestamp();

        await channel.send({
            content: '새로운 이벤트가 등록되었습니다! @everyone',
            embeds: [eventEmbed]
        });

        scheduledNotifications.set(scheduledEvent.id, { thirtyMinNotified: false });

    } catch (error) {
        console.error('Error sending event notification:', error);
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);