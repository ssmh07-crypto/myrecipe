import type { RecipeFolder } from '../types/recipe'

const unsplashImage = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=900`

export const categoryImagePresets = [
  '1495521821757-a1efb6729352',
  '1598515214211-89d3c73ae83b',
  '1600891964599-f61ba0e24092',
  '1467003909585-2f8a72700288',
  '1473093226795-af9932fe5856',
  '1504674900247-0877df9cc836',
  '1547592180-85f173990554',
  '1565299624946-b28f40a0ae38',
  '1551183053-bf91a1d81141',
  '1512621776951-a57141f2eefd',
  '1563379926898-05f4575a45d8',
  '1569718212165-3a8278d5f624',
  '1540189549336-e6e99c3679fe',
  '1484723091739-30a097e8f929',
  '1490645935967-10de6ba17061',
  '1546069901-ba9599a7e63c',
  '1571997478779-2adcbbe9ab2f',
  '1528712306091-ed0763094c98',
  '1482049016688-2d3e1b311543',
  '1565958011703-44f9829ba187',
  '1529042410759-befb1204b468',
  '1572448862527-d3c904757de6',
  '1578985545062-69928b1d9587',
  '1562565652-a0d8f0c59eb4',
  '1559847844-5315695dadae',
  '1515003197210-e0cd71810b5f',
  '1505253758473-96b7015fcd40',
  '1432139555190-58524dae6a55',
  '1476224203421-9ac39bcb3327',
  '1556911220-e15b29be8c8f',
].map(unsplashImage)

export const getRandomCategoryImage = (exclude?: string | null) => {
  const candidates = categoryImagePresets.filter((image) => image !== exclude)
  return candidates[Math.floor(Math.random() * candidates.length)] || categoryImagePresets[0]
}

export const fallbackFolderImage = {
  image: categoryImagePresets[0],
  label: 'CATEGORY',
}

export const folderImages: Record<string, { image: string; label: string }> = {
  CHICKEN: {
    image: categoryImagePresets[1],
    label: 'CHICKEN',
  },
  MEAT: {
    image: categoryImagePresets[2],
    label: 'MEAT',
  },
  FISH: {
    image: categoryImagePresets[3],
    label: 'FISH',
  },
  PASTA: {
    image: categoryImagePresets[4],
    label: 'PASTA',
  },
}

export const getFolderImage = (folder: Pick<RecipeFolder, 'name' | 'image_url'>) => {
  const preset = folderImages[folder.name.trim().toUpperCase()]
  return {
    image: folder.image_url || preset?.image || fallbackFolderImage.image,
    label: preset?.label || folder.name || fallbackFolderImage.label,
  }
}
