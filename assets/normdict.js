/**
 * normdict.js — 기본 표제어 통합 사전
 * 형식: { canonical: '표제어', variants: ['변형1', '변형2', ...] }
 * 전처리 시 variants → canonical 로 자동 치환됨
 * (canonical 자체는 variants에 포함하지 않아도 됨 — 치환 대상 아님)
 */
const DEFAULT_NORMDICT = [

  // ── 은둔·고립 ──────────────────────────────────────
  { canonical: '은둔', variants: [
    '은둔형', '은둔자', '은둔생활', '은둔하고', '은둔하',
    '은둔하게', '은둔해', '은둔할', '은둔한다', '은둔하시',
    '은둔한게', '은둔중입니다', '재은둔중이에요',
  ]},
  { canonical: '은둔청년', variants: ['청년은둔'] },
  { canonical: '고립', variants: [
    '고립된', '고립됨', '고립되', '고립되어', '고립하면',
    '고립되는거죠', '고립되는경우',
  ]},
  { canonical: '은둔고립', variants: ['고립은둔', '고립이나은둔'] },

  // ── 가족·관계 ──────────────────────────────────────
  { canonical: '부모', variants: ['부모님', '부모님말', '부모탓', '부모포함'] },
  { canonical: '가족', variants: ['가족분위기'] },
  { canonical: '친구', variants: ['내친구'] },

  // ── 취업·일 ────────────────────────────────────────
  { canonical: '취업', variants: [
    '취업해', '취업하고', '취업한다고', '취업하기',
    '취업했는데', '취업못한다고', '취업하더라', '청년취업',
  ]},
  { canonical: '재취업', variants: ['재취업하'] },
  { canonical: '취업률', variants: ['취업율'] },
  { canonical: '직장', variants: [
    '직장만', '직장가', '직장다니고', '직장다니면', '직장에서보면',
  ]},
  { canonical: '회사', variants: ['회사탓', '회사내', '중소회사가', '다른회사가'] },
  { canonical: '직업', variants: ['어떤직업이든'] },
  { canonical: '일자리', variants: ['일자리라서요', '일자리가없지않는데'] },
  { canonical: '알바',   variants: ['알바라', '단기알바'] },

  // ── 사회·국가 ──────────────────────────────────────
  { canonical: '사회', variants: [
    '사회적', '사회임', '사회라', '사회에선', '사회적인', '우리사회', '사회탓',
  ]},
  { canonical: '한국', variants: ['우리나라', '대한민국', '한국만'] },
  { canonical: '한국사회', variants: ['한국사회다', '한국사회에선'] },
  { canonical: '나라', variants: ['나라임', '이나라', '나라든지', '나라이면서', '울나라'] },

  // ── 심리·정신 ──────────────────────────────────────
  { canonical: '마음', variants: ['마음속', '마음깊숙히', '마음단단히', '마음잡고'] },
  { canonical: '정신', variants: ['정신적인', '정신적', '정신상태'] },
  { canonical: '정신과', variants: ['정신과의원'] },
  { canonical: '병원',  variants: ['병원가'] },
  { canonical: '무기력', variants: [
    '무기력하게', '무기력해지고', '무기력해', '무기력한건', '무기력하고',
  ]},
  { canonical: '우울',   variants: ['우울해', '우울한', '우울하고', '우울해하거'] },
  { canonical: '우울증', variants: ['우울증잇으믄'] },

  // ── 삶·인생 ────────────────────────────────────────
  { canonical: '인생', variants: ['인생길', '인생이란게', '내인생'] },
  { canonical: '세상', variants: ['이세상에선', '세상이겠죠', '세상인데', '세상탓한다고'] },

  // ── 기능어 (있다/없다 → 불용어로도 필터됨) ──────────
  { canonical: '있다', variants: ['있어', '있어요', '있으면', '있고', '있기는'] },
  { canonical: '없다', variants: ['없어', '없음', '없고', '없는데'] },

  // ── 기타 ───────────────────────────────────────────
  { canonical: '힘들다',   variants: ['힘든', '힘들고', '힘들어', '힘들게'] },
  { canonical: '못하다',   variants: ['못하면', '못하고', '못하', '못해'] },
  { canonical: '포기하다', variants: ['포기하고', '포기하면'] },
  { canonical: '일하다',   variants: ['일하고', '일하면', '일해', '일했다', '일하'] },
  { canonical: '시작하다', variants: ['시작해', '시작하고', '시작하면', '시작했다'] },
  { canonical: '개인',     variants: ['개개인'] },
  { canonical: '말하다',   variants: ['말하'] },
  { canonical: '원하다',   variants: ['원하'] },
  { canonical: '만들다',   variants: ['만드', '만들고'] },
  { canonical: '나가다',   variants: ['나가고'] },
  { canonical: '생각하다', variants: ['생각하고', '생각하'] },
  { canonical: '안되다',   variants: ['안되', '안되면', '안됨', '안된다'] },
  { canonical: '사지멀쩡하다', variants: ['사지', '사지멀쩡한', '사지멀쩡한데', '사지멀쩡하면'] },
  { canonical: '노가다',   variants: ['노가다라'] },
  { canonical: '살아가다', variants: ['살아가'] },
  { canonical: '응원하다', variants: ['응원합니다', '응원', '응원해요', '응원할게요', '응원하겠습니다', '고마워요'] },
  { canonical: '하루',     variants: ['하루하루'] },
  { canonical: '숏폼',     variants: ['숏츠', '쇼츠'] },
  { canonical: '스마트폰', variants: ['핸드폰', '휴대폰', '핸폰'] },
  { canonical: 'TV',       variants: ['티비'] },
  { canonical: '뇌썩음',   variants: ['썩음', '브레인롯', 'rot'] },
  { canonical: '자극적',   variants: ['자극적인'] },
  { canonical: '활용하다', variants: ['활용하', '활용'] },
  { canonical: 'AI',       variants: ['ai', 'Ai', '에이아이', '인공지능'] },
  { canonical: 'ChatGPT',  variants: ['챗지피티', '지피티', 'GPT', 'gpt', '챗gpt', '챗GPT', '쳇지피티'] },
  { canonical: '고맙다',   variants: ['고마워', '고맙다고', '고마움', '고마운', '고마운걸', '감사', '감사합니다', '감사인사'] },
  { canonical: '공손하다', variants: ['공손하게', '공손한', '친절하게'] },
  { canonical: '응답',     variants: ['답변', '대답'] },
  { canonical: '전기요금', variants: ['전기세'] },
  { canonical: '옵티머스', variants: ['옵티'] },
  { canonical: '머스크',     variants: ['일론', '일론머스크'] },
  { canonical: '발전속도',   variants: ['발전속'] },
  { canonical: '발전하다',   variants: ['발전해', '발전하고'] },
  { canonical: '느리다',     variants: ['느려'] },
  { canonical: '해방되다',   variants: ['해방되고'] },
  { canonical: '집안',       variants: ['우리집안'] },
  { canonical: '조종',       variants: ['원격조종'] },
  { canonical: '현대차',     variants: ['현대자동차', '현기차', '현차'] },
  { canonical: '현대차노조',   variants: ['현대노조', '현대차노조'] },
  { canonical: '노조',         variants: ['노조원'] },
  { canonical: '파업',         variants: ['파업하고', '파업해', '파업하'] },
  { canonical: '반대',         variants: ['반대한다고', '반대해'] },
  { canonical: '걱정하다',     variants: ['걱정하'] },
  { canonical: '괜찮다',       variants: ['괜찮', '괜차', '갠차', '괜찮아요'] },
  { canonical: '멋있다',   variants: ['멋있', '멋있어요', '멋있네요'] },
  { canonical: '멋지다',   variants: ['멋진', '멋집니다', '멋져요'] },
  { canonical: '좋다',     variants: ['좋네요', '좋아요', '좋겠다', '좋고'] },
  { canonical: '힙합',     variants: ['힙합이지', '힙합이네'] },
  { canonical: '생기다',   variants: ['생겼네', '생겼다'] },
  { canonical: '대단하다', variants: ['대단한'] },
  { canonical: '잘생기다', variants: ['잘생겼다', '잘생겼네'] },
  { canonical: '자본주의',     variants: ['자본주'] },
  { canonical: '천민자본주의', variants: ['천민자본주'] },
  { canonical: '노력',         variants: ['노력해'] },
  { canonical: '생각',     variants: ['생각합니다', '생각해'] },
];
