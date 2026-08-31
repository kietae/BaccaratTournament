'use strict';

const initial = [
  ['음식', 'ㄱ ㅂ ㅌ', '갈비탕'], ['음식', 'ㅅ ㅌ ㅇ ㅋ', '스테이크'], ['음식', 'ㄱ ㅊ ㅈ ㄱ', '곱창전골'],
  ['음식', 'ㅈ ㅇ ㅂ ㅇ', '제육볶음'], ['음식', 'ㅂ ㅂ ㄱ ㅅ', '비빔국수'], ['영화', 'ㅌ ㅇ ㅅ ㅌ ㄹ', '토이스토리'],
  ['영화', 'ㅇ ㄱ ㅅ ㄴ ㄴ ㅈ', '왕과 사는 남자'], ['영화', 'ㅇ ㅌ ㅅ ㅌ ㄹ', '인터스텔라'], ['영화', 'ㅋ ㄹ ㅂ ㅇ ㅇ ㅎ ㅈ', '캐리비안의 해적'],
  ['영화', 'ㅇ ㄷ ㅅ ㅇ', '오디세이'], ['사자성어', 'ㅇ ㅈ ㅅ ㅈ', '역지사지'], ['사자성어', 'ㄱ ㅅ ㅇ ㅅ', '구사일생'],
  ['사자성어', 'ㅅ ㄱ ㅈ ㅁ', '선견지명'], ['사자성어', 'ㅁ ㅇ ㅈ ㅁ', '무용지물'], ['사자성어', 'ㅊ ㄱ ㅁ ㅂ', '천고마비']
].map(([category, prompt, answer], index) => ({ category, prompt, answerImage: `/workshop/initial-answers/q${String(index + 1).padStart(2, '0')}.jpg`, answer, aliases: [answer] }));

const ox = [
  ['다리털이나 수염을 면도기로 밀면, 털이 더 굵고 진하게 자란다.', 'X', '잘린 털의 굵은 단면 때문에 그렇게 보일 뿐입니다.'],
  ['추운 날 술을 마시면 따뜻하게 느껴지지만, 실제 중심 체온은 떨어진다.', 'O', '알코올이 혈관을 확장해 체열 손실을 키웁니다.'],
  ["낙타의 혹 안에는 비상시에 마실 수 있는 물이 들어 있다.", 'X', '혹에는 물이 아니라 지방이 저장됩니다.'],
  ["북극곰의 털은 하얗지만 피부는 검은색이다.", 'O', '털은 사실 투명하고 피부는 검은색입니다.'],
  ["박쥐는 시각이 완전히 퇴화해 앞을 보지 못한다.", 'X', '박쥐도 눈이 있으며 종에 따라 밤눈도 밝습니다.'],
  ["뱀에게 물렸을 때 입으로 독을 빨아내는 것은 도움이 된다.", 'X', '구조자와 환자 모두에게 위험하므로 119를 불러야 합니다.'],
  ["금붕어의 기억력은 최소 3개월 이상 지속될 수 있다.", 'O', '먹이 시간과 사람을 기억할 정도의 학습 능력이 있습니다.'],
  ["아인슈타인은 어릴 때 수학 낙제생이었다.", 'X', '어릴 때부터 미적분을 익힌 수학 신동이었습니다.'],
  ["혀끝은 단맛, 혀 뒤는 쓴맛만 느낀다.", 'X', '혀의 어느 위치에서도 여러 맛을 느낄 수 있습니다.'],
  ["프랑켄슈타인은 괴물의 이름이 아니다.", 'O', '괴물을 만든 박사의 이름이 프랑켄슈타인입니다.'],
  ["타조는 무서우면 머리를 모래 속에 파묻는다.", 'X', '둥지를 정리하는 모습에서 생긴 오해입니다.'],
  ["하이힐은 원래 남성 기병을 위해 만들어졌다.", 'O', '등자에서 발이 빠지지 않게 하려던 굽에서 시작됐습니다.'],
  ["중간 크기 뭉게구름 하나는 코끼리 100마리보다 무거울 수 있다.", 'O', '가로세로 약 1km 구름은 약 500톤에 이를 수 있습니다.'],
  ["헬로키티는 공식 설정상 고양이가 아니라 소녀다.", 'O', '산리오 설정상 영국에 사는 키티 화이트라는 소녀입니다.'],
  ["SOS는 Save Our Souls의 약자다.", 'X', '모스 부호로 쉽고 분명해서 정해졌으며 약자가 아닙니다.'],
  ["달에서 맨눈으로 볼 수 있는 유일한 인공 건축물은 만리장성이다.", 'X', '달에서는 맨눈으로 볼 수 없습니다.'],
  ["클레오파트라는 피라미드 건설 시기보다 아이폰 출시 시기에 더 가깝게 살았다.", 'O', '피라미드와는 약 2,500년, 아이폰과는 약 2,000년 차이입니다.']
].map(([prompt, answer, explanation], index) => ({ category: 'OX', prompt, image: `/workshop/ox-answers/q${String(index + 1).padStart(2, '0')}.jpg`, answer, aliases: [answer], explanation }));

const faces = ['김태희','구교환','박명수','박보검','신민아','김태리','박보영','박서준','박은빈','비비','이제훈','조정석','한효주','허성태']
  .map((answer, index) => ({ category: '인물', prompt: '이 눈·코·입의 주인공은 누구일까요?', image: `/workshop/faces/q${String(index + 1).padStart(2, '0')}.jpg`, answerImage: `/workshop/faces-answers/q${String(index + 1).padStart(2, '0')}.jpg`, answer, aliases: [answer] }));

const brands = [
  ['소니','sony'], ['리바이스','levis','리바이스'], ['레드불','redbull','레드 불'], ['어도비','adobe'], ['씨엔엔','cnn'],
  ['현대','hyundai','현대자동차'], ['푸마','puma'], ['샤넬','chanel'], ['오메가','omega'], ['에르메스','hermes'],
  ['이케아','ikea'], ['펩시','pepsi'], ['페덱스','fedex'], ['루이비통','louisvuitton','루이 비통'], ['맥도날드','mcdonalds','맥도날드'],
  ['테슬라','tesla'], ['닌텐도','nintendo'], ['아디다스','adidas'], ['구찌','gucci']
].map(([answer, ...aliases], index) => ({ category: '브랜드', prompt: '조각난 로고의 브랜드는?', image: `/workshop/brands/q${String(index + 1).padStart(2, '0')}.png`, answerImage: `/workshop/brands-answers/q${String(index + 1).padStart(2, '0')}.png`, answer, aliases: [answer, ...aliases] }));

const QUIZZES = {
  initial: { title: '초성 퀴즈', input: 'text', questions: initial },
  ox: { title: '긴가민가 OX 퀴즈', input: 'ox', questions: ox },
  faces: { title: '눈·코·입 인물 퀴즈', input: 'text', questions: faces },
  brands: { title: '뒤죽막죽 브랜드 맞추기', input: 'text', questions: brands }
};

module.exports = { QUIZZES };
