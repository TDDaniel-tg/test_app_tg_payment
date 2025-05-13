// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;

// Основные настройки приложения
const CONFIG = {
    apiUrl: window.location.origin, // Базовый URL для API
    userId: tg.initDataUnsafe?.user?.id || getQueryParam('userId') || 'test_user', // ID пользователя Telegram
    userName: tg.initDataUnsafe?.user?.first_name || getQueryParam('userName') || 'Тестовый пользователь',
    isDev: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
};

// Подписки и их цены
const PLANS = [
    { id: 'basic', name: 'Базовый', price: 199, description: 'Доступ к основным функциям бота на 1 месяц' },
    { id: 'standard', name: 'Стандартный', price: 499, description: 'Доступ ко всем функциям бота на 1 месяц' },
    { id: 'premium', name: 'Премиум', price: 999, description: 'Доступ ко всем функциям бота на 3 месяца со скидкой' }
];

// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Открываем Telegram WebApp (сообщаем что приложение готово)
    tg.expand();
    tg.ready();

    // Инициализируем интерфейс
    initUI();
    initEventListeners();

    console.log('Telegram WebApp initialized', CONFIG.userId);
});

// Инициализация основного интерфейса
function initUI() {
    // Получаем имя пользователя
    const userNameElement = document.getElementById('userName');
    if (userNameElement) {
        userNameElement.innerText = CONFIG.userName;
    }

    // Генерируем карточки подписок
    const plansContainer = document.getElementById('plans');
    if (plansContainer) {
        PLANS.forEach(plan => {
            const planCard = createPlanCard(plan);
            plansContainer.appendChild(planCard);
        });
    }

    // Скрываем модальное окно успешной оплаты при загрузке
    const successModal = document.getElementById('successModal');
    if (successModal) {
        successModal.classList.add('hidden');
    }
}

// Добавляем обработчики событий
function initEventListeners() {
    // Обработчик для закрытия модального окна успешной оплаты
    const closeSuccessBtn = document.getElementById('closeSuccess');
    if (closeSuccessBtn) {
        closeSuccessBtn.addEventListener('click', () => {
            document.getElementById('successModal').classList.add('hidden');
            // Закрываем приложение Telegram после закрытия модального окна
            tg.close();
        });
    }
}

// Создание карточки тарифного плана
function createPlanCard(plan) {
    const card = document.createElement('div');
    card.className = 'plan-card';
    card.id = `plan-${plan.id}`;

    card.innerHTML = `
        <h3>${plan.name}</h3>
        <p class="price">${plan.price} ₽</p>
        <p class="description">${plan.description}</p>
        <button class="buy-btn" data-plan-id="${plan.id}" data-plan-name="${plan.name}" data-price="${plan.price}">
            Оформить
        </button>
    `;

    // Добавляем обработчик нажатия на кнопку "Оформить"
    const buyBtn = card.querySelector('.buy-btn');
    buyBtn.addEventListener('click', () => handlePlanSelection(plan));

    return card;
}

// Обработка выбора тарифного плана
async function handlePlanSelection(plan) {
    console.log(`Выбран план "${plan.name}" за ${plan.price} ₽`);
    
    // Показываем индикатор загрузки
    showLoader();
    
    // Блокируем кнопки покупки на время обработки
    setButtonsState(false);
    
    try {
        // Отправляем запрос на создание платежа
        const paymentData = await createPayment(plan.price, plan.name, CONFIG.userId);
        console.log('Данные платежа:', paymentData);
        
        if (!paymentData || paymentData.error) {
            throw new Error(paymentData?.error || 'Не удалось создать платеж');
        }
        
        // Инициализируем платежный виджет с полученным токеном
        await initPaymentWidget(
            paymentData.confirmationToken, 
            paymentData.testMode, 
            paymentData.orderId
        );
    } catch (error) {
        console.error('Ошибка при создании платежа:', error);
        showError(`Не удалось создать платеж: ${error.message}`);
    } finally {
        // Скрываем индикатор загрузки
        hideLoader();
        
        // Разблокируем кнопки покупки
        setButtonsState(true);
    }
}

// Функция для создания платежа на сервере
async function createPayment(amount, planName, userId) {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/api/create-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount.toString(),
                planName: planName,
                userId: userId,
                description: `Подписка "${planName}"`
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Ошибка при создании платежа:', error);
        throw error;
    }
}

// Инициализация платежного виджета ЮKassa
async function initPaymentWidget(token, isTestMode, orderId) {
    console.log(`Инициализация платежного виджета. Тестовый режим: ${isTestMode}`);
    
    // Очищаем контейнер для виджета
    const paymentContainer = document.getElementById('paymentFormContainer');
    paymentContainer.innerHTML = '';
    
    // Показываем контейнер с формой оплаты
    const paymentModal = document.getElementById('paymentModal');
    paymentModal.classList.remove('hidden');
    
    // Добавляем кнопку закрытия модального окна
    const closePaymentBtn = document.getElementById('closePayment');
    closePaymentBtn.addEventListener('click', () => {
        paymentModal.classList.add('hidden');
    });
    
    if (isTestMode) {
        // Создаем тестовую форму оплаты
        const testForm = document.createElement('div');
        testForm.className = 'test-payment-form';
        testForm.innerHTML = `
            <h3>Тестовый режим оплаты</h3>
            <p class="test-mode-note">Используйте следующие данные для теста:</p>
            
            <div class="card-form">
                <div class="form-group">
                    <label>Номер карты</label>
                    <input type="text" value="4111 1111 1111 1111" readonly class="card-number" />
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>Месяц/Год</label>
                        <input type="text" value="12/30" readonly class="card-date" />
                    </div>
                    <div class="form-group">
                        <label>CVC</label>
                        <input type="text" value="123" readonly class="card-cvc" />
                    </div>
                </div>
            </div>
            
            <button id="testPayButton" class="pay-button">Оплатить</button>
        `;
        
        paymentContainer.appendChild(testForm);
        
        // Обработчик для тестовой оплаты
        document.getElementById('testPayButton').addEventListener('click', async () => {
            try {
                // Имитируем процесс оплаты
                showLoader();
                document.getElementById('testPayButton').disabled = true;
                
                // Отображаем анимацию загрузки для имитации процесса
                setTimeout(async () => {
                    try {
                        // Вызываем тестовый маршрут для имитации успешной оплаты
                        const result = await fetch(`${CONFIG.apiUrl}/api/test-payment`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ orderId })
                        }).then(res => res.json());
                        
                        console.log('Результат тестовой оплаты:', result);
                        
                        if (result.status === 'succeeded') {
                            // Закрываем форму оплаты
                            paymentModal.classList.add('hidden');
                            
                            // Показываем модальное окно успешной оплаты
                            showSuccessModal();
                        } else {
                            throw new Error('Ошибка платежа');
                        }
                    } catch (error) {
                        console.error('Ошибка при тестовой оплате:', error);
                        showError('Не удалось выполнить тестовую оплату');
                    } finally {
                        hideLoader();
                        document.getElementById('testPayButton').disabled = false;
                    }
                }, 1500); // Задержка для имитации процесса оплаты
            } catch (error) {
                console.error('Ошибка при тестовой оплате:', error);
                hideLoader();
                document.getElementById('testPayButton').disabled = false;
                showError('Не удалось выполнить тестовую оплату');
            }
        });
    } else {
        try {
            // Проверяем наличие библиотеки YooKassa
            if (typeof YooMoneyCheckoutWidget !== 'function') {
                throw new Error('Библиотека YooKassa не загружена');
            }
            
            // Инициализация виджета YooKassa
            const yooKassaWidget = new YooMoneyCheckoutWidget({
                confirmation_token: token,
                return_url: window.location.href,
                error_callback: function(error) {
                    console.error('Ошибка YooKassa виджета:', error);
                    showError(`Ошибка платежного виджета: ${error.message || 'Неизвестная ошибка'}`);
                }
            });
            
            // Отрисовка виджета
            yooKassaWidget.render('paymentFormContainer')
                .then(() => {
                    console.log('Виджет YooKassa успешно отрисован');
                    
                    // Запускаем периодическую проверку статуса платежа
                    checkPaymentStatus(orderId);
                })
                .catch(err => {
                    console.error('Ошибка при отрисовке виджета YooKassa:', err);
                    showError(`Не удалось отобразить форму оплаты: ${err.message || 'Неизвестная ошибка'}`);
                    
                    // Если не удалось отрисовать виджет, показываем тестовую форму
                    fallbackToTestMode(token, orderId);
                });
        } catch (error) {
            console.error('Ошибка инициализации виджета YooKassa:', error);
            showError(`Ошибка инициализации платежного виджета: ${error.message}`);
            
            // Если есть ошибка с виджетом, показываем тестовую форму
            fallbackToTestMode(token, orderId);
        }
    }
}

// Функция для перехода в тестовый режим при проблемах с виджетом YooKassa
function fallbackToTestMode(token, orderId) {
    console.log('Переход в тестовый режим из-за проблем с виджетом YooKassa');
    initPaymentWidget(token, true, orderId);
}

// Функция для проверки статуса платежа
function checkPaymentStatus(orderId) {
    console.log(`Начинаем проверку статуса платежа ${orderId}`);
    
    // Интервал для проверки статуса каждые 3 секунды
    const statusCheckInterval = setInterval(async () => {
        try {
            // Запрашиваем статус платежа с сервера
            const response = await fetch(`${CONFIG.apiUrl}/api/payment-status/${orderId}`);
            const statusData = await response.json();
            
            console.log(`Статус платежа ${orderId}:`, statusData);
            
            // Если платеж успешно завершен
            if (statusData.status === 'succeeded') {
                // Останавливаем проверку статуса
                clearInterval(statusCheckInterval);
                
                // Закрываем модальное окно с формой оплаты
                document.getElementById('paymentModal').classList.add('hidden');
                
                // Показываем модальное окно успешной оплаты
                showSuccessModal();
            }
            
            // Если платеж отменен или произошла ошибка
            if (statusData.status === 'canceled') {
                // Останавливаем проверку статуса
                clearInterval(statusCheckInterval);
                
                // Показываем сообщение об ошибке
                showError('Платеж был отменен');
            }
        } catch (error) {
            console.error('Ошибка при проверке статуса платежа:', error);
        }
    }, 3000);
    
    // Останавливаем проверку через 5 минут (300000 мс) для избежания бесконечной проверки
    setTimeout(() => {
        clearInterval(statusCheckInterval);
        console.log(`Проверка статуса платежа ${orderId} остановлена по таймауту`);
    }, 300000);
}

// Показать модальное окно успешной оплаты
function showSuccessModal() {
    const successModal = document.getElementById('successModal');
    successModal.classList.remove('hidden');
}

// Показать сообщение об ошибке
function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        
        // Скрываем сообщение через 5 секунд
        setTimeout(() => {
            errorElement.classList.add('hidden');
        }, 5000);
    } else {
        alert(message);
    }
}

// Показать индикатор загрузки
function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.remove('hidden');
    }
}

// Скрыть индикатор загрузки
function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('hidden');
    }
}

// Включить/отключить кнопки покупки
function setButtonsState(enabled) {
    const buttons = document.querySelectorAll('.buy-btn');
    buttons.forEach(button => {
        button.disabled = !enabled;
    });
}

// Вспомогательная функция для получения параметров из URL
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
} 