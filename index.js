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

// 적절한 알림 채널을 자동으로 찾는 함수
function findAnnouncementChannel(guild) {
   // 시스템 채널 확인
   if (guild.systemChannel) {
       return guild.systemChannel;
   }

   // 채널 이름으로 찾기
   return guild.channels.cache.find(channel => 
       channel.type === 0 && // 텍스트 채널만
       (
           channel.name.includes('공지') ||
           channel.name.includes('알림') ||
           channel.name.includes('announcement') ||
           channel.name.includes('notice') ||
           channel.name.includes('notify')
       )
   );
}

client.once('ready', async () => {
   console.log(`Logged in as ${client.user.tag}`);
   console.log('Bot is ready to use!');
   
   // 모든 서버의 알림 채널 자동 설정
   client.guilds.cache.forEach(guild => {
       const announcementChannel = findAnnouncementChannel(guild);
       if (announcementChannel) {
           serverConfigs.set(guild.id, announcementChannel.id);
           console.log(`Auto-configured channel for ${guild.name}: ${announcementChannel.name}`);
       } else {
           console.log(`Could not find suitable announcement channel for ${guild.name}`);
       }
   });

   checkExistingEvents();
   checkUpcomingEvents();
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

client.on('guildCreate', async guild => {
   console.log(`Bot joined new guild: ${guild.name}`);
   
   // 알림 채널 자동 설정
   const announcementChannel = findAnnouncementChannel(guild);
   if (announcementChannel) {
       serverConfigs.set(guild.id, announcementChannel.id);
       console.log(`Auto-configured channel for new guild ${guild.name}: ${announcementChannel.name}`);
       
       // 설정 완료 알림 전송
       try {
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
       } catch (error) {
           console.error(`Error sending auto-config notification: ${error}`);
       }
   }

   const events = await guild.scheduledEvents.fetch();
   events.forEach(event => {
       if (event.status !== 'COMPLETED' &&
           event.scheduledStartTimestamp > Date.now() &&
           !scheduledNotifications.has(event.id)) {
           scheduledNotifications.set(event.id, {
               fifteenMinNotified: false,
               fiveMinNotified: false
           });
       }
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
           .setTitle('🎉 기존 이벤트 알림')
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

       eventEmbed
           .setURL(`https://discord.com/events/${event.guildId}/${event.id}`)
           .setFooter({ text: '이벤트에 참여하시려면 위 제목을 클릭하세요!' })
           .setTimestamp();

       await channel.send({
           content: '기존 이벤트 알림입니다 @everyone',
           embeds: [eventEmbed]
       });
       console.log(`Sent notification for existing event: ${event.name}`);
   } catch (error) {
       console.error('Error sending existing event notification:', error);
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
       console.log(`Set event channel for guild ${message.guild.name}: ${message.channel.name}`);
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
       startTime: new Date(scheduledEvent.scheduledStartTimestamp).toLocaleString(),
       recurrenceRule: scheduledEvent.recurrenceRule ? {
           frequency: scheduledEvent.recurrenceRule.frequency,
           count: scheduledEvent.recurrenceRule.count,
           byWeekday: scheduledEvent.recurrenceRule.byWeekday,
           interval: scheduledEvent.recurrenceRule.interval
       } : null
   });

   const guildId = scheduledEvent.guildId;
   const channelId = serverConfigs.get(guildId);

   if (!channelId) {
       const guild = await client.guilds.fetch(guildId);
       const announcementChannel = findAnnouncementChannel(guild);
       if (announcementChannel) {
           serverConfigs.set(guildId, announcementChannel.id);
           console.log(`Auto-configured channel for guild ${guild.name}: ${announcementChannel.name}`);
       } else {
           console.log(`No event channel set for guild ${guildId}`);
           return;
       }
   }

   try {
       const channel = await client.channels.fetch(channelId);
       console.log(`Sending notification to channel: ${channel.name}`);

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

       if (scheduledEvent.recurrenceRule) {
           const frequencyText = {
               1: '매일',
               2: '매주',
               3: '매월',
               4: '매년'
           }[scheduledEvent.recurrenceRule.frequency] || '';

           let repeatText = `${frequencyText} `;

           if (scheduledEvent.recurrenceRule.byWeekday && scheduledEvent.recurrenceRule.byWeekday.length > 0) {
               const weekdays = scheduledEvent.recurrenceRule.byWeekday
                   .map(day => weekdayText[day])
                   .join(', ');
               repeatText += `${weekdays}마다 `;
           }

           repeatText += '반복되는 이벤트입니다';

           eventEmbed.addFields({
                   name: '🔄 반복 설정',
                   value: repeatText,
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

       console.log('Event notification sent successfully');

       scheduledNotifications.set(scheduledEvent.id, {
           fifteenMinNotified: false,
           fiveMinNotified: false
       });

   } catch (error) {
       console.error('Error sending event notification:', error, error.stack);
   }
});

client.login(process.env.DISCORD_BOT_TOKEN);
