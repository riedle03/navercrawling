# 슬기로운 말글마이너 — 네이버 뉴스편

네이버 뉴스 검색 API로 수집한 기사 제목·발췌문을 텍스트마이닝하는 **교육용 Vanilla JS SPA**.

> 시리즈 비교: [YouTube 댓글편](https://github.com/riedle03/youtubecrawling) (대중의 반응) ↔ **네이버 뉴스편** (언론의 표현)
> 같은 키워드로 두 도구를 비교하는 미디어 리터러시 수업에 활용할 수 있습니다.

---

## 주요 기능

| 단계 | 기능 |
|------|------|
| Step 1 | 네이버 뉴스 기사 수집 (최대 1,000건) |
| Step 1 | 3단계 자동 중복 제거 (완전동일 → 도메인 쿼터 → Jaccard 유사도) |
| Step 1 | 날짜 필터 · 관련성 필터 (클라이언트) |
| Step 1 | 언론사 분포 도넛 차트 |
| Step 2 | 바른(Bareun) 형태소 분석 전처리 |
| Step 3 | 단어 빈도 분석 |
| Step 4 | 막대차트 시각화 |
| Step 5 | 워드클라우드 |
| Step 6 | SNA(의미연결망 분석) |

---

## 시작하기

### 1. 네이버 검색 API 키 발급

1. [developers.naver.com](https://developers.naver.com) 접속 → 로그인
2. 내 애플리케이션 → 애플리케이션 등록
3. 사용 API: **검색** 선택
4. 환경: **WEB** 선택, 서비스 URL: `https://news.naver.com/` 입력
5. 생성된 **Client ID** / **Client Secret** 복사

### 2. 앱 설정에 키 입력

화면 우상단 ⚙️ 아이콘 → Client ID / Secret 입력 → 저장
저장 시 자동으로 연결 확인 테스트를 수행합니다.

### 3. 검색어 입력 후 수집 시작

Step 1 검색 설정 카드에서 검색어를 입력하고 수집을 시작합니다.

---

## 로컬 개발

```bash
# 1. 저장소 복제
git clone https://github.com/riedle03/navercrawling.git
cd navercrawling

# 2. 환경변수 파일 생성
cp .env.example .env
# .env 파일에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 입력

# 3. 의존성 설치 및 로컬 서버 실행
npm install
node server.js

# 4. 브라우저에서 접속
# http://localhost:3000
```

> **주의**: 브라우저에서 파일을 직접 열면(`file://`) CORS 오류가 발생합니다. 반드시 `localhost:3000`으로 접속하세요.

---

## 배포 (Vercel)

```bash
# Vercel CLI 설치
npm i -g vercel

# 환경변수 등록
vercel env add NAVER_CLIENT_ID
vercel env add NAVER_CLIENT_SECRET

# 배포
vercel --prod
```

`vercel.json`이 `/api/naver` 요청을 서버리스 함수로 라우팅합니다.

---

## 중복 제거 파이프라인

```
1단계  완전 동일 제목 제거 (Set 비교)
2단계  동일 도메인 쿼터  (기본: 도메인당 최대 5건, UI에서 조절 가능)
3단계  Jaccard 유사도 ≥ 0.33 제거
       (제목 단어집합 OR 제목+발췌 단어집합 중 하나라도 임계값 이상)
```

중복 제거 임계값은 검색 설정 카드에서 조절할 수 있습니다.

---

## 관련성 필터

검색어 토큰이 기사 제목 또는 발췌문에 하나라도 포함된 기사만 통과시킵니다.
날짜 필터 이후, 중복 제거 이전 단계에 적용되며 토글로 끌 수 있습니다.

```
전체 수집 → 날짜 필터 → 관련성 필터 → 중복 제거 → 고유 기사
```

---

## 파일 구조

```
navercrawling/
├── index.html              메인 SPA
├── guide.html              교사용 수업 가이드
├── privacy.html            개인정보처리방침
├── vercel.json             Vercel 라우팅 설정
├── server.js               로컬 개발 프록시 (Express)
├── .env.example            환경변수 예시
├── api/
│   └── naver.js            Vercel 서버리스 함수 (CORS 프록시)
├── css/
│   └── style.css           네이버 그린 브랜딩
├── js/
│   ├── app.js              앱 상태 관리
│   ├── settings.js         API 키 설정 모달
│   ├── step1_collector.js  기사 수집 + 중복 제거 (핵심)
│   ├── step2_preprocess.js 형태소 분석 전처리
│   ├── step3_frequency.js  빈도 분석
│   ├── step4_barchart.js   막대차트
│   ├── step5_wordcloud.js  워드클라우드
│   ├── step6_sna.js        SNA 네트워크 그래프
│   ├── normdict.js         단어 통합 사전 (뉴스+YouTube 통합)
│   ├── stopwords.js        불용어 사전 (뉴스+YouTube 통합 885개)
│   └── utils.js            공통 유틸리티
└── assets/
    ├── stopwords.js        불용어 (브라우저 번들용)
    ├── normdict.js         단어 통합 사전 (브라우저 번들용)
    └── wordcloud2.js       wordcloud2.js 로컬 사본
```

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| UI | Vanilla JS + Tailwind CSS CDN |
| 차트 | Chart.js 4.4.0 |
| 워드클라우드 | wordcloud2.js 1.2.2 |
| 네트워크 그래프 | D3.js 7.9.0 |
| 형태소 분석 | 바른(Bareun) API |
| CORS 프록시 | Vercel Serverless Function |
| 로컬 개발 서버 | Node.js + Express |

---

## 데이터 수집 한계

- 네이버 뉴스 API는 기사 **전문이 아닌 제목(~30자)과 발췌문(~150-250자)만** 제공합니다.
- 최대 수집량은 1,000건입니다 (display 100 × start 1~901).
- 수집 시점에 따라 결과가 달라질 수 있습니다.

---

## 관련 프로젝트

- [슬기로운 말글마이너: YouTube 댓글편](https://github.com/riedle03/youtubecrawling)
- [바른(Bareun) 형태소 분석기](https://bareun.ai)
- [네이버 검색 API 문서](https://developers.naver.com/docs/serviceapi/search/news/news.md)

---

## 라이선스

교육 목적 자유 사용. 상업적 이용 및 재배포 시 출처를 명시해주세요.
