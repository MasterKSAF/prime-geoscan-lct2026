// Vite transforms this import to a same-origin bundled worker constructor.
declare module '*?worker' {
  const WorkerConstructor: new (options?: WorkerOptions) => Worker;
  export default WorkerConstructor;
}
