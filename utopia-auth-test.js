// Додавання розділу налаштувань у Lampa
Lampa.SettingsApi.addComponent({
  component: 'utopia_auth',
  name: 'Utopia Auth',
  icon: '<svg>...</svg>'
});

// Додавання полів вводу
Lampa.SettingsApi.addParam({
  component: 'utopia_auth',
  param: {
    name: 'utopia_login',
    type: 'input',
    default: ''
  },
  field: {
    name: 'Логін Utopia',
    description: 'Введіть логін від акаунта'
  }
});

Lampa.SettingsApi.addParam({
  component: 'utopia_auth',
  param: {
    name: 'utopia_password',
    type: 'input',
    default: ''
  },
  field: {
    name: 'Пароль Utopia',
    description: 'Введіть пароль'
  }
});
