import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
    test: {
        // 作業用のコピー（worktree）のテストは数えない
        exclude: [...configDefaults.exclude, '.claude/**'],
        // CPU 同士の試合を何本も回すテストは、GitHub Actions では既定の5秒を超える
        testTimeout: 60000
    }
});
