// まるおゲーム共通：ランキングサーバー（Supabase）の接続情報
// 全ゲームで同じ値を使います。空のままでもゲームは遊べます（自己ベストのみ記録）。
// 入れてよいのは公開用キー（sb_publishable_… または anon public）だけ。秘密のキーは絶対に入れないこと。
window.MARUO_CONFIG = window.MARUO_CONFIG || {
  SUPABASE_URL: 'https://ghhvpkfngtgmwzuvjfda.supabase.co',
  SUPABASE_KEY: 'sb_publishable_htKvFnnY-3Tcc4eEEQKwEg_zMju3PZK'
};
