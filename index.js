const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.MessageContent,
    ]
});

const NOTIFICATION_CHANNEL_ID = process.env.YOUR_DISCORD_CHANNEL_ID;
// 예정된 이벤트 알림을 저장할 Map
const scheduledNotifications = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('Notification Channel ID:', NOTIFICATION_CHANNEL_ID);
    console.log('Watching for events...');
    checkUpcomingEvents();
});

// 1시간 전 알림을 위한 주기적 체크
function checkUpcomingEvents() {
    setInterval(async () => {
        const now = Date.now();
        scheduledNotifications.forEach(async (notified, eventId) => {
            const event = await client.guilds.cache.first()?.scheduledEvents.fetch(eventId).catch(() => null);
            if (!event) {
                scheduledNotifications.delete(eventId);
                return;
            }

            const timeUntilEvent = event.scheduledStartTimestamp - now;
            // 1시간 전 (허용 오차 1분)
            if (timeUntilEvent <= 3600000 && timeUntilEvent > 3540000 && !notified.oneHourNotified) {
                sendEventReminder(event, '1시간');
                notified.oneHourNotified = true;
            }
        });
    }, 60000); // 1분마다 체크
}

async function sendEventReminder(event, timeLeft) {
    try {
        const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
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

client.on(Events.GuildScheduledEventCreate, async scheduledEvent => {
    console.log('New event detected:', scheduledEvent.name);
    try {
        const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);

        const eventEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎉 새로운 이벤트가 등록되었습니다!')
            .setDescription(`# ${scheduledEvent.name}\n\n`) // 이벤트 이름을 더 크게
            .addFields(
                { name: '\u200B', value: '\u200B' }, // 빈 줄 추가
                {
                    name: '📅 시작 시간',
                    value: `<t:${Math.floor(scheduledEvent.scheduledStartTimestamp / 1000)}:F>\n(<t:${Math.floor(scheduledEvent.scheduledStartTimestamp / 1000)}:R>)`,
                    inline: false // inline을 false로 변경
                },
                { name: '\u200B', value: '\u200B' } // 빈 줄 추가
            );

        if (scheduledEvent.scheduledEndTimestamp) {
            eventEmbed.addFields({
                    name: '⏰ 종료 시간',
                    value: `<t:${Math.floor(scheduledEvent.scheduledEndTimestamp / 1000)}:F>`,
                    inline: false
                },
                { name: '\u200B', value: '\u200B' }); // 빈 줄 추가
        }

        if (scheduledEvent.description) {
            eventEmbed.addFields({
                    name: '📝 설명',
                    value: scheduledEvent.description,
                    inline: false
                },
                { name: '\u200B', value: '\u200B' }); // 빈 줄 추가
        }

        if (scheduledEvent.entityMetadata?.location) {
            eventEmbed.addFields({
                    name: '📍 장소',
                    value: scheduledEvent.entityMetadata.location,
                    inline: false
                },
                { name: '\u200B', value: '\u200B' }); // 빈 줄 추가
        }

        eventEmbed
            .setURL(`https://discord.com/events/${scheduledEvent.guildId}/${scheduledEvent.id}`)
            .setFooter({ text: '이벤트에 참여하시려면 위 제목을 클릭하세요!' })
            .setTimestamp();

        await channel.send({
            content: '새로운 이벤트가 등록되었습니다! @everyone',
            embeds: [eventEmbed]
        });

        // 1시간 전 알림을 위해 이벤트 저장
        scheduledNotifications.set(scheduledEvent.id, { oneHourNotified: false });

        console.log('Event notification sent successfully!');
    } catch (error) {
        console.error('Error sending event notification:', error);
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);