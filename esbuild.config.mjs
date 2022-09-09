import { build } from "esbuild";

build({
    entryPoints: [ "./src/index.js" ],
    bundle: true,
    platform: 'node',
    target: 'node16',
    outdir: './dist',
    minify: true,
    mainFields: ['module', 'main'],
}).catch(err => {
    console.log(err.message);
    process.exit(1);
});
