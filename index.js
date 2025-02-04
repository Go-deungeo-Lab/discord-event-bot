const { Client, GatewayIntentBits, Events, EmbedBuilder, PermissionsBitField } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages
    ]
});

const weekdayText = {
    0: '일요일',
    1: '월요일',
    2: '화요일',
    3: '수요일',
    4: '목요일',
    5: '금요일',
    6: '토요일'
};

const serverConfigs = new Map();
const scheduledNotifications = new Map();

// 채널 찾기 함수 강화
async function findAnnouncementChannel(guild) {
    console.log(`Searching for announcement channel in ${guild.name}...`);
    
    try {
        // 모든 채널 새로 fetch
        await guild.channels.fetch();
        
        // 봇 멤버 정보 fetch
        const botMember = await guild.members.fetchMe();
        console.log(`Bot permissions in ${guild.name}:`, botMember.permissions.toArray());

        // 채널 우선순위 설정
        const channelPriorities = [
            // 1순위: 시스템 채널
            () => guild.systemChannel,
            // 2순위: 공지/알림 채널
            () => guild.channels.cache.find(channel => 
                channel.type === 0 && 
                channel.permissionsFor(botMember).has(PermissionsBitField.Flags.SendMessages) &&
                (channel.name.includes('공지') || 
                 channel.name.includes('알림') || 
                 channel.name.includes('notice') || 
                 channel.name.includes('announcement'))
            ),
            // 3순위: 일반 채널
            () => guild.channels.cache.find(channel => 
                channel.type === 0 && 
                channel.permissionsFor(botMember).has(PermissionsBitField.Flags.SendMessages) &&
                channel.name.includes('일반')
            ),
            // 4순위: 첫 번째 쓸 수 있는 텍스트 채널
            () => guild.channels.cache.find(channel => 
                channel.type === 0 && 
                channel.permissionsFor(botMember).has(PermissionsBitField.Flags.SendMessages)
            )
        ];

        for (const findChannel of channelPriorities) {
            const channel = findChannel();
            if (channel) {
                console.log(`Found suitable channel in ${guild.name}: #${channel.name}`);
                return channel;
            }
        }

        console.log(`No suitable channel found in ${guild.name}`);
        return null;

    } catch (error) {
        console.error(`Error finding announcement channel in ${guild.name}:`, error);
        return null;
    }
}

client.once('ready', async () => {
   console.log(`Logged in as ${client.user.tag}`);
   console.log('Bot is ready to use!');
   
   // 모든 서버의 알림 채널 자동 설정
   for (const [, guild] of client.guilds.cache) {
       try {
           const announcementChannel = await findAnnouncementChannel(guild);
           if (announcementChannel) {
               serverConfigs.set(guild.id, announcementChannel.id);
               console.log(`Auto-configured channel for ${guild.name}: #${announcementChannel.name}`);
               
               await announcementChannel.send({
                   embeds: [
                       new EmbedBuilder()
                           .setColor('#00ff00')
                           .setTitle('✅ 이벤트 알림 채널 자동 설정')
                           .setDescription('이 채널이 이벤트 알림 채널로 자동 설정되었습니다.')
                           .addFields(
                               { name: '채널', value: `<#${announcementChannel.id}>` },
                               { name: '변경 방법', value: '다른 채널에서 `!seteventchannel` 명령어를 사용하여 변경할 수 있습니다.' }
                           )
                           .setTimestamp()
                   ]
               });
           }
       } catch (error) {
           console.error(`Error setting up guild ${guild.name}:`, error);
       }
   }

   checkExistingEvents();
   checkUpcomingEvents();
});

client.on('guildCreate', async guild => {
   console.log(`Bot joined new guild: ${guild.name}`);
   try {
       // 새로운 길드 정보 fetch
       await guild.fetch();
       
       // 알림 채널 자동 설정
       const announcementChannel = await findAnnouncementChannel(guild);
       if (announcementChannel) {
           serverConfigs.set(guild.id, announcementChannel.id);
           console.log(`Auto-configured channel for new guild ${guild.name}: #${announcementChannel.name}`);
           
           try {
               await announcementChannel.send({
                   embeds: [
                       new EmbedBuilder()
                           .setColor('#00ff00')
                           .setTitle('✅ 이벤트 알림 봇 초대 완료')
                           .setDescription('이벤트 알림 봇이 서버에 추가되었습니다.')
                           .addFields(
                               { name: '알림 채널', value: `이 채널(<#${announcementChannel.id}>)이 이벤트 알림 채널로 자동 설정되었습니다.` },
                               { name: '변경 방법', value: '다른 채널에서 `!seteventchannel` 명령어를 사용하여 변경할 수 있습니다.' },
                               { name: '도움말', value: '`!eventhelp` 명령어로 자세한 사용법을 확인할 수 있습니다.' }
                           )
                           .setTimestamp()
                   ]
               });
               console.log(`Sent welcome message to ${guild.name}`);
           } catch (error) {
               console.error(`Error sending welcome message to ${guild.name}:`, error);
           }
       }

       // 기존 이벤트 체크
       const events = await guild.scheduledEvents.fetch();
       console.log(`Found ${events.size} existing events in ${guild.name}`);
       
       events.forEach(event => {
           if (event.status !== 'COMPLETED' &&
               event.scheduledStartTimestamp > Date.now() &&
               !scheduledNotifications.has(event.id)) {
               scheduledNotifications.set(event.id, {
                   fifteenMinNotified: false,
                   fiveMinNotified: false
               });
               
               // 기존 이벤트에 대한 알림 전송
               if (announcementChannel) {
                   sendEventNotification(event, announcementChannel.id);
               }
           }
       });
   } catch (error) {
       console.error(`Error setting up new guild ${guild.name}:`, error);
   }
});

async function checkExistingEvents() {
   try {
       console.log('Checking existing events...');
       for (const [, guild] of client.guilds.cache) {
           console.log(`Checking guild: ${guild.name}`);
           const events = await guild.scheduledEvents.fetch();
           console.log(`Found ${events.size} events in ${guild.name}`);
           
           events.forEach(event => {
               console.log('Full event object:', {
                   ...event,
                   _rawData: event._rawData
               });
               
               console.log('Event details:', {
                   name: event.name,
                   id: event.id,
                   startTime: event.scheduledStartTimestamp,
                   recurrenceRule: event.recurrenceRule ? {
                       frequency: event.recurrenceRule.frequency,
                       count: event.recurrenceRule.count,
                       byWeekday: event.recurrenceRule.byWeekday,
                       interval: event.recurrenceRule.interval
                   } : null
               });

               const timeUntilEvent = event.scheduledStartTimestamp - Date.now();
               if (event.status !== 'COMPLETED' &&
                   timeUntilEvent > 900000 &&
                   !scheduledNotifications.has(event.id)) {
                   scheduledNotifications.set(event.id, {
                       fifteenMinNotified: false,
                       fiveMinNotified: false
                   });
                   console.log(`Added existing event: ${event.name}`);

                   const channelId = serverConfigs.get(event.guildId);
                   if (channelId) {
                       sendEventNotification(event, channelId);
                   }
               }
           });
       }
   } catch (error) {
       console.error('Error checking existing events:', error, error.stack);
   }
}

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

           if (timeUntilEvent <= 900000 && timeUntilEvent > 840000 && !notified.fifteenMinNotified) {
               sendEventReminder(event, '15분');
               notified.fifteenMinNotified = true;
           }

           if (timeUntilEvent <= 300000 && timeUntilEvent > 240000 && !notified.fiveMinNotified) {
               sendEventReminder(event, '5분');
               notified.fiveMinNotified = true;
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
       console.log(`Sent ${timeLeft} reminder for event: ${event.name}`);
   } catch (error) {
       console.error('Error sending event reminder:', error);
   }
}

async function sendEventNotification(event, channelId) {
   try {
       const channel = await client.channels.fetch(channelId);
       const eventEmbed = new EmbedBuilder()
           .setColor('#5865F2')
           .setTitle('🎉 이벤트 알림')
           .setDescription(`# ${event.name}\n\n`)
           .addFields(
               { name: '\u200B', value: '\u200B' },
               {
                   name: '📅 시작 시간',
                   value: `<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:F>\n(<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:R>)`,
                   inline: false
               }
           );

       if (event.recurrenceRule) {
           const frequencyText = {
               1: '매일',
               2: '매주',
               3: '매월',
               4: '매년'
           }[event.recurrenceRule.frequency] || '';

           let repeatText = `${frequencyText} `;

           if (event.recurrenceRule.byWeekday && event.recurrenceRule.byWeekday.length > 0) {
               const weekdays = event.recurrenceRule.byWeekday
                   .map(day => weekdayText[day])
                   .join(', ');
               repeatText += `${weekdays}마다 `;
           }

           repeatText += '반복되는 이벤트입니다';

           eventEmbed.addFields({
               name: '🔄 반복 설정',
               value: repeatText,
               inline: false
           });
       }

       if (event.description) {
           eventEmbed.addFields({
               name: '📝 설명',
               value: event.description,
               inline: false
           });
       }

       if (event.entityMetadata?.location) {
           eventEmbed.addFields({
               name: '📍 장소',
               value: event.entityMetadata.location,
               inline: false
           });
       }

       eventEmbed
           .setURL(`https://discord.com/events/${event.guildId}/${event.id}`)
           .setFooter({ text: '이벤트에 참여하시려면 위 제목을 클릭하세요!' })
           .setTimestamp();

       await channel.send({
           content: '@everyone',
           embeds: [eventEmbed]
       });
       console.log(`Sent notification for event: ${event.name}`);
   } catch (error) {
       console.error('Error sending event notification:', error);
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
       console.log(`Set event channel for guild ${message.guild.name}: #${message.channel.name}`);
   }

   if (message.content === '!eventhelp') {
       message.reply({
           embeds: [
               new EmbedBuilder()
                   .setColor('#5865F2')
                   .setTitle('📚 이벤트 봇 도움말')
                   .setDescription('이벤트 알림 봇 사용 방법입니다.')
                   .addFields(
                       { name: '자동 설정', value: '봇이 서버에 참여하면 자동으로 공지/알림 채널을 찾아 설정합니다.', inline: false },
                       { name: '!seteventchannel', value: '현재 채널을 이벤트 알림 채널로 설정합니다.\n(서버 관리 권한 필요)', inline: false },
                       { name: '자동 알림', value: '• 새 이벤트 생성 시 알림\n• 이벤트 시작 15분 전 알림\n• 이벤트 시작 5분 전 알림', inline: false }
                   )
                   .setFooter({ text: '추가 문의: 봇 개발자에게 문의하세요' })
           ]
       });
   }
});

client.on(Events.GuildScheduledEventCreate, async scheduledEvent => {
   console.log('=== New Event Creation Detected ===');
   console.log('Event Details:', {
       name: scheduledEvent.name,
       id: scheduledEvent.id,
       guildId: scheduledEvent.guildId,
       startTime: new Date(scheduledEvent.scheduledStartTimestamp).toLocaleString(),
       recurrenceRule: scheduledEvent.recurrenceRule ? {
           frequency: scheduledEvent.recurrenceRule.frequency,
           count: scheduledEvent.recurrenceRule.count,
           byWeekday: scheduledEvent.recurrenceRule.byWeekday,
           interval: scheduledEvent.recurrenceRule.interval
       } : null
   });

   const guildId = scheduledEvent.guildId;
   let channelId = serverConfigs.get(guildId);

   // 채널이 설정되어 있지 않으면 자동 설정 시도
   if (!channelId) {
       const guild = await client.guilds.fetch(guildId);
       const announcementChannel = await findAnnouncementChannel(guild);
       if (announcementChannel) {
           channelId = announcementChannel.id;
           serverConfigs.set(guildId, channelId);
           console.log(`Auto-configured channel for guild ${guild.name}: #${announcementChannel.name}`);
       } else {
           console.log(`No event channel set for guild ${guildId}`);
           return;
       }
   }

   try {
       const channel = await client.channels.fetch(channelId);
       console.log(`Sending notification to channel: #${channel.name}`);

       // 이벤트 알림 전송
       await sendEventNotification(scheduledEvent, channelId);

       // 알림 예약
       scheduledNotifications.set(scheduledEvent.id, {
           fifteenMinNotified: false,
           fiveMinNotified: false
       });

       console.log('Event notification sent successfully');
   } catch (error) {
       console.error('Error sending event notification:', error, error.stack);
   }
});

client.login(process.env.DISCORD_BOT_TOKEN);
