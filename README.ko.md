# @withwiz/sms-core

[English](./README.md) | 한국어

SMS/LMS/MMS 발송 코어. provider 중립 인터페이스와 알리고·솔라피 어댑터를 제공한다.

## 설치

```bash
pnpm add @withwiz/sms-core
# 솔라피를 사용할 때만
pnpm add solapi
```

## 사용

provider 어댑터는 루트 진입점이 아니라 서브 경로에서 가져온다. 알리고는 Node의 fetch·Blob을,
솔라피는 fs를 쓰는 SDK를 의존하므로, 루트에서 함께 내보내면 클라이언트 컴포넌트가 전화번호 유틸
같은 범용 함수만 가져와도 서버 전용 코드가 브라우저 번들에 섞이기 때문이다.

```typescript
import { createAligoProvider } from '@withwiz/sms-core/providers/aligo';

const provider = createAligoProvider({
  credentials: async () => ({ userId, apiKey, sender }),
});

const outcome = await provider.send({
  type: 'SMS',
  sender,
  content: '안내 문자입니다.',
  recipients: ['01012345678', '01087654321'],
});

if (!outcome.ok) {
  console.error(outcome.errorCode, outcome.errorMessage);
}
```

메시지 유형(`type`)은 호출 측이 정해서 넘긴다. 발송 폼처럼 사용자가 탭으로 SMS/LMS/MMS를 직접
고르는 구조라면 유형 판정 로직이 따로 필요하지 않다.

## 보조 함수

- `byteLength`: EUC-KR 기준 바이트 길이를 센다. `@withwiz/sms-admin`의 발송 폼이 입력 중인
  본문·제목의 바이트 수를 화면에 보여줄 때 사용한다.
- `resolveMessageType`: 내용과 첨부 상태로 메시지 유형을 자동으로 정하고 싶을 때 쓸 수 있는
  보조 함수다. `chunkRecipients`와 마찬가지로 현재 소비처는 없다.

## 발송 요청 검증

`send`는 자격 증명을 불러오거나 네트워크에 접근하기 전에 수신자 목록을 먼저 검사한다. 빈 목록,
휴대폰 번호 형식에 맞지 않는 값, provider가 허용하는 수보다 긴 목록은 모두 `SmsProviderError`로
거부한다. 이 검사가 추가되기 전에는 `capabilities.maxRecipientsPerRequest`가 아무도 지키지 않는
상한을 알리고 있었고, `isValidMobilePhone`은 스스로를 수신자 검증의 기준이라고 설명하면서도 어떤
발송 경로에서도 호출되지 않았다.

무효한 항목이 하나라도 있으면 일부만 걸러내지 않고 요청 전체를 거부한다. 누락 사실을 전달받지 못한
호출 측은 모든 수신자에게 발송되었다고 판단하기 때문이다. 무효한 항목을 제외하고 발송하려면 `send`를
호출하기 전에 `isValidMobilePhone`으로 걸러내고, 한 번에 보낼 수 있는 수를 넘는 경우에는
`chunkRecipients`로 목록을 나눈다.

오류 메시지에는 번호 자체가 아니라 문제가 된 항목의 위치를 담는다. 오류 메시지는 로그로 남고 전화번호는
개인정보이기 때문이다.

발신번호도 함께 검사한다. 요청에 발신번호가 없으면 자격 증명의 값으로 대체되기 때문에, 대체가 끝난
시점에 검사한다. 발신번호는 휴대폰 번호보다 넓은 규칙을 따르는데, 유선번호나 대표번호를 쓰는 경우가
많기 때문이다. 그래서 검사 기준을 따로 두었다. `0`으로 시작하는 9~11자리 번호이거나, 15xx·16xx·18xx
대역의 8자리 대표번호이면 통과한다. 입력 폼에서 쓸 수 있도록 `isValidSenderPhone`을 공개한다. 다만
형식만 확인할 뿐이다. provider는 계정에 미리 등록된 번호로만 발송하며 그 사실은 로컬에서 확인할 수
없으므로, 이 검사를 통과한 번호라도 provider가 거부할 수 있다.

## MMS 이미지 안전장치

MMS의 `imageUrl`은 호출 측이 넘기는 값이고, 그 주소로 요청을 보내는 주체는 서버다. 그래서 두 어댑터
모두 값을 사용하기 전에 URL을 검증한다. `http:`와 `https:`만 허용하고, 루프백·사설·링크로컬을 비롯한
예약 대역은 거부하므로 `169.254.169.254`의 클라우드 메타데이터 엔드포인트도 함께 차단된다. 이미지를
직접 내려받는 알리고 어댑터는 리다이렉트를 따라가지 않고, 타임아웃을 적용하며, 크기 상한을 넘기는
본문은 전송이 끝나기 전에 중단한다. 솔라피 어댑터는 SDK에 값을 넘기기 전에 검증한다. 그렇게 하지
않으면 파일 경로를 받는 `uploadFile`에 로컬 경로가 그대로 전달될 수 있기 때문이다.

이름 해석은 검증 이후에 일어나므로, 차단 대역으로 해석되는 호스트명까지는 막지 못한다. 그 수준까지
필요하다면 네트워크 계층에서 외부로 나가는 트래픽을 제한해야 한다.

규칙은 `src/config/image-fetch.ts`에 기본값으로 들어 있다. 이미지 서버가 사내망에 있는 환경이라면
provider마다 다음과 같이 재정의한다.

```typescript
import {
  createAligoProvider,
  DEFAULT_IMAGE_FETCH_POLICY,
} from '@withwiz/sms-core/providers/aligo';

const provider = createAligoProvider({
  credentials: async () => ({ userId, apiKey, sender }),
  imageFetchPolicy: { ...DEFAULT_IMAGE_FETCH_POLICY, blockedSubnets: [] },
});
```

`fetchImage` 옵션을 지정하면 내장 fetch가 검증까지 포함해 통째로 대체되므로, 그렇게 구현할 때에는
호출 측이 넘긴 URL을 직접 검증해야 한다.

## provider 능력 비교

| 항목 | 알리고 | 솔라피 |
|------|--------|--------|
| 요청당 수신자 | 1,000명 | 10,000건 |
| 수신자별 결과 | 미제공 | 제공 |
| MMS 이미지 | 요청마다 첨부 | 사전 업로드 |

## 라이선스

MIT
