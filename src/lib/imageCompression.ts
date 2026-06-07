const maxImageBytes = 5 * 1024 * 1024
const maxSourceBytes = 30 * 1024 * 1024
const maxDimension = 1800

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('이미지를 압축하지 못했습니다.'))
    }, 'image/jpeg', quality)
  })

export const compressRecipeImage = async (file: File) => {
  if (file.size <= maxImageBytes) return file
  if (file.size > maxSourceBytes) {
    throw new Error('원본 이미지는 최대 30MB까지 압축할 수 있습니다.')
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))

  const context = canvas.getContext('2d')
  if (!context) throw new Error('이미지를 압축하지 못했습니다.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  let quality = 0.86
  let blob = await canvasToBlob(canvas, quality)
  while (blob.size > maxImageBytes && quality > 0.45) {
    quality -= 0.08
    blob = await canvasToBlob(canvas, quality)
  }

  if (blob.size > maxImageBytes) {
    throw new Error('이미지를 5MB 이하로 압축하지 못했습니다. 더 작은 사진을 선택해 주세요.')
  }

  const filename = `${file.name.replace(/\.[^.]+$/, '') || 'recipe-image'}.jpg`
  return new File([blob], filename, { type: 'image/jpeg' })
}
