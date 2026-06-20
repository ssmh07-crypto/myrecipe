import type { RecipeFolder } from '../types/recipe'

export const fallbackFolderImage = {
  image: 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&q=80&w=900',
  label: 'CATEGORY',
}

export const folderImages: Record<string, { image: string; label: string }> = {
  CHICKEN: {
    image: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&q=80&w=900',
    label: 'CHICKEN',
  },
  MEAT: {
    image: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&q=80&w=900',
    label: 'MEAT',
  },
  FISH: {
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&q=80&w=900',
    label: 'FISH',
  },
  PASTA: {
    image: 'https://images.unsplash.com/photo-1473093226795-af9932fe5856?auto=format&fit=crop&q=80&w=900',
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
