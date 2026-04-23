// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
export default defineConfig({
    plugins: [
        react(),
        {
            name: "patch-zego-tracer",
            enforce: "pre",
            transform: function (code, id) {
                if (!id.includes("zego-uikit-prebuilt"))
                    return null;
                var patched = code;
                patched = patched.replace(/\.createSpan\(/g, "?.createSpan?.(");
                patched = patched.replace(/\.startSpan\(/g, "?.startSpan?.(");
                patched = patched.replace(/\.startActiveSpan\(/g, "?.startActiveSpan?.(");
                patched = patched.replace(/(\w+)\.end\(\)/g, function (_match, varName) { return "".concat(varName, "?.end()"); });
                return { code: patched, map: null };
            },
        },
    ],
    optimizeDeps: {
        include: ["@zegocloud/zego-uikit-prebuilt"],
        esbuildOptions: {
            plugins: [
                {
                    name: "patch-zego-createspan",
                    setup: function (build) {
                        build.onLoad({ filter: /zego-uikit-prebuilt/ }, function (args) {
                            var code = fs.readFileSync(args.path, "utf8");
                            code = code.replace(/\.createSpan\(/g, "?.createSpan?.(");
                            code = code.replace(/\.startSpan\(/g, "?.startSpan?.(");
                            code = code.replace(/\.startActiveSpan\(/g, "?.startActiveSpan?.(");
                            code = code.replace(/(\w+)\.end\(\)/g, function (_, v) { return "".concat(v, "?.end()"); });
                            return { contents: code, loader: "js" };
                        });
                    },
                },
            ],
        },
    },
    server: {
        port: 5173,
    },
});
