export const Toast = ({ message }: { message: string }) =>
  message ? (
    <div className="fixed left-4 right-4 top-4 z-50 mx-auto max-w-md rounded-lg bg-stone-950 px-4 py-3 text-sm font-medium text-white shadow-lg">
      {message}
    </div>
  ) : null
