import type { RecipeInput } from '../types/recipe'

export const dummyRecipes: RecipeInput[] = [
  {
    title: '김치볶음밥',
    image_url: '',
    ingredients: [
      { name: '밥', amount: '1', unit: '공기' },
      { name: '익은 김치', amount: '1', unit: '컵' },
      { name: '대파', amount: '1/2', unit: '대' },
      { name: '계란', amount: '1', unit: '개' },
    ],
    seasonings: [
      { name: '간장', amount: '1', unit: '작은술' },
      { name: '참기름', amount: '1', unit: '작은술' },
      { name: '고춧가루', amount: '1', unit: '작은술' },
    ],
    steps_text: '1. 대파와 김치를 잘게 썬다.\n2. 팬에 대파를 볶아 향을 낸다.\n3. 김치와 밥을 넣고 볶은 뒤 간을 맞춘다.\n4. 계란 프라이를 올린다.',
    servings: 1,
    memo: '김치를 충분히 볶아야 신맛이 부드러워진다.',
    source_url: '',
    source_type: 'manual',
  },
  {
    title: '간장계란밥',
    image_url: '',
    ingredients: [
      { name: '밥', amount: '1', unit: '공기' },
      { name: '계란', amount: '2', unit: '개' },
      { name: '쪽파', amount: '', unit: '약간' },
    ],
    seasonings: [
      { name: '간장', amount: '1', unit: '큰술' },
      { name: '참기름', amount: '1', unit: '큰술' },
      { name: '깨', amount: '', unit: '약간' },
    ],
    steps_text: '1. 따뜻한 밥을 그릇에 담는다.\n2. 반숙 계란 프라이를 만든다.\n3. 밥 위에 계란과 양념을 올려 섞는다.',
    servings: 1,
    memo: '참기름은 마지막에 넣어야 향이 좋다.',
    source_url: '',
    source_type: 'manual',
  },
  {
    title: '닭가슴살 샐러드',
    image_url: '',
    ingredients: [
      { name: '닭가슴살', amount: '1', unit: '팩' },
      { name: '샐러드 채소', amount: '2', unit: '줌' },
      { name: '방울토마토', amount: '6', unit: '개' },
      { name: '오이', amount: '1/3', unit: '개' },
    ],
    seasonings: [
      { name: '올리브오일', amount: '1', unit: '큰술' },
      { name: '레몬즙', amount: '1', unit: '큰술' },
      { name: '소금', amount: '', unit: '약간' },
      { name: '후추', amount: '', unit: '약간' },
    ],
    steps_text: '1. 닭가슴살을 데우거나 구워 먹기 좋게 찢는다.\n2. 채소를 씻어 물기를 제거한다.\n3. 재료를 담고 드레싱을 뿌린다.',
    servings: 1,
    memo: '레몬즙을 넉넉히 넣으면 산뜻하다.',
    source_url: '',
    source_type: 'manual',
  },
]
