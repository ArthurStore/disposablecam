module.exports = {
  apps: [
    {
      name: 'disposable-camera',
      script: 'server.js',
      exec_mode: 'cluster',
      instances: 'max',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3020
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3020
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
