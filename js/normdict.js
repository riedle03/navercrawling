/**
 * normdict.js — 뉴스 텍스트 기본 단어 통합 사전
 * 뉴스에서 자주 나타나는 표기 변형을 표제어로 통합
 * (YouTube 댓글판 사전과 병합 — 2026-03-15)
 */
const DEFAULT_NORMDICT = [
  // ── 정치·행정 ─────────────────────────────────────
  { canonical: '대통령',   variants: ['대통령실', '대통령부', '대통령직'] },
  { canonical: '국회',     variants: ['국회의사당', '국회법', '국회의원'] },
  { canonical: '정부',     variants: ['중앙정부', '지방정부', '정부측'] },
  { canonical: '여당',     variants: ['여당측', '여권'] },
  { canonical: '야당',     variants: ['야당측', '야권'] },

  // ── 경제·금융 ─────────────────────────────────────
  { canonical: '금리',     variants: ['기준금리', '시장금리', '대출금리', '예금금리'] },
  { canonical: '물가',     variants: ['소비자물가', '생산자물가', '물가상승', '인플레이션'] },
  { canonical: '주식',     variants: ['주가', '증시', '주식시장'] },
  { canonical: '부동산',   variants: ['부동산시장', '아파트', '주택시장', '부동산값'] },
  { canonical: '경제성장', variants: ['경제성장률', 'GDP성장', '성장률'] },
  { canonical: '전기요금', variants: ['전기세'] },
  { canonical: '자본주의', variants: ['자본주', '천민자본주의', '천민자본주'] },
  { canonical: '빈곤',     variants: ['빈곤율', '빈곤한', '빈곤층', '빈곤문제'] },

  // ── 노동·취업 ─────────────────────────────────────
  { canonical: '취업',   variants: [
    '취업해', '취업하고', '취업한다고', '취업하기',
    '취업했는데', '취업못한다고', '취업하더라', '청년취업',
  ]},
  { canonical: '재취업',  variants: ['재취업하'] },
  { canonical: '취업률',  variants: ['취업율'] },
  { canonical: '직장',   variants: ['직장만', '직장가', '직장다니고', '직장다니면'] },
  { canonical: '회사',   variants: ['회사탓', '회사내', '중소회사가'] },
  { canonical: '직업',   variants: ['어떤직업이든'] },
  { canonical: '일자리', variants: ['일자리라서요'] },
  { canonical: '알바',   variants: ['알바라', '단기알바'] },
  { canonical: '니트족', variants: ['니트', 'NEET'] },
  { canonical: '노조',   variants: ['노조원', '현대노조', '현대차노조'] },
  { canonical: '파업',   variants: ['파업하고', '파업해', '파업하'] },

  // ── 사회·교육 ─────────────────────────────────────
  { canonical: '외톨이', variants: ['외톨'] },
  { canonical: '학교',   variants: ['초등학교', '중학교', '고등학교', '초중고'] },
  { canonical: '대학교', variants: ['대학', '대학원', '전문대'] },
  { canonical: '환경',   variants: ['환경부', '환경오염', '환경문제', '기후변화'] },
  { canonical: '의료',   variants: ['의료계', '의료진', '의료기관', '의료비'] },
  { canonical: '복지',   variants: ['사회복지', '복지정책', '복지제도', '복지서비스'] },
  { canonical: '사회',   variants: ['사회적', '사회임', '사회라', '사회에선', '사회적인', '우리사회'] },
  { canonical: '한국',   variants: ['우리나라', '대한민국', '한국만'] },
  { canonical: '한국사회', variants: ['한국사회다', '한국사회에선'] },

  // ── 은둔·고립 ─────────────────────────────────────
  { canonical: '은둔',     variants: [
    '은둔형', '은둔자', '은둔생활', '은둔하고', '은둔하',
    '은둔하게', '은둔해', '은둔할', '은둔한다', '은둔한게',
  ]},
  { canonical: '은둔청년', variants: ['청년은둔'] },
  { canonical: '고립',     variants: ['고립된', '고립됨', '고립되', '고립되어', '고립하면'] },
  { canonical: '은둔고립', variants: ['고립은둔', '고립이나은둔'] },

  // ── 심리·정신건강 ────────────────────────────────
  { canonical: '정신',   variants: ['정신적인', '정신적', '정신상태'] },
  { canonical: '정신과', variants: ['정신과의원'] },
  { canonical: '병원',   variants: ['병원가'] },
  { canonical: '무기력', variants: ['무기력하게', '무기력해지고', '무기력해', '무기력한건', '무기력하고'] },
  { canonical: '우울',   variants: ['우울해', '우울한', '우울하고', '우울해하거'] },
  { canonical: '우울증', variants: ['우울증잇으믄'] },

  // ── 기술·산업 ─────────────────────────────────────
  { canonical: '인공지능', variants: ['AI', 'ai', 'Ai', '에이아이', '딥러닝', '머신러닝'] },
  { canonical: 'ChatGPT',  variants: ['챗지피티', '지피티', 'GPT', 'gpt', '챗gpt', '챗GPT', '쳇지피티'] },
  { canonical: '반도체',   variants: ['반도체산업', '반도체시장', '칩'] },
  { canonical: '전기차',   variants: ['전기자동차', 'EV', 'ev'] },
  { canonical: '스마트폰', variants: ['휴대폰', '핸드폰', '핸폰', '모바일기기'] },
  { canonical: '숏폼',     variants: ['숏츠', '쇼츠'] },
  { canonical: 'TV',       variants: ['티비'] },
  { canonical: '현대차',   variants: ['현대자동차', '현기차', '현차'] },

  // ── 국제·외교 ─────────────────────────────────────
  { canonical: '미국',  variants: ['미'] },
  { canonical: '중국',  variants: ['중'] },
  { canonical: '일본',  variants: ['일'] },
  { canonical: '북한',  variants: ['북', '조선'] },
  { canonical: '머스크', variants: ['일론', '일론머스크'] },
];
