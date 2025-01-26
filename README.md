# Discord 이벤트 알림 봇

서버의 이벤트를 자동으로 알려주고 시작 전에 리마인더를 보내주는 Discord 봇입니다.

## 주요 기능

- 🔔 새로운 이벤트 생성 시 자동 알림
- ⏰ 이벤트 시작 1시간 전 리마인더
- 📍 서버별 커스텀 알림 채널 설정
- 💬 상세한 이벤트 정보 표시
- 🔑 서버별 독립적인 설정

## 봇 초대하기

[여기를 클릭](https://discord.com/oauth2/authorize?client_id=1332161924514840616&permissions=8590019584&integration_type=0&scope=bot)하여 이벤트 알림 봇을 Discord 서버에 초대하세요.

## 명령어

- `!seteventchannel` - 현재 채널을 이벤트 알림 채널로 설정
- `!eventhelp` - 봇 사용법 안내 표시

## 설정 방법

서버에서 봇을 설정하는 방법:

1. 위의 링크로 봇을 초대
2. 알림을 받고 싶은 채널에서 `!seteventchannel` 명령어 사용
3. 서버에서 이벤트 생성
4. 봇이 자동으로 새 이벤트 알림을 보냄

## 필요한 권한

봇이 정상적으로 작동하기 위해 필요한 권한들:
- 이벤트 관리
- 채널 보기
- 메시지 보내기
- 임베드 링크
- 외부 이모지 사용

## 직접 호스팅하기

봇을 직접 호스팅하고 싶다면:

1. 이 저장소를 클론
2. 의존성 설치:
```bash
npm install
```
3. `.env` 파일 생성 및 설정:
```env
DISCORD_BOT_TOKEN=봇_토큰
```
4. 봇 실행:
```bash
npm start
```

## 환경 변수

- `DISCORD_BOT_TOKEN` - Discord 봇 토큰


## 도움말

봇 사용 중 도움이 필요하시다면:
1. `!eventhelp` 명령어 사용
2. 이 저장소에 이슈 생성
3. 봇 개발자에게 문의

## 기술 스택

- Node.js
- Discord.js
- Railway (호스팅)
