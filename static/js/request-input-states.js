(function () {
    'use strict';

    function normalizeResult(result, fallbackMessage) {
        if (result === true || result == null) {
            return { valid: true, message: '' };
        }
        if (result === false) {
            return { valid: false, message: fallbackMessage || '입력값을 확인해 주세요.' };
        }
        return {
            valid: !!result.valid,
            message: result.message || fallbackMessage || '입력값을 확인해 주세요.'
        };
    }

    function hasTextValue(control, value) {
        if (control && control.type === 'checkbox') {
            return !!value;
        }
        return String(value == null ? '' : value).trim() !== '';
    }

    function attach(control, options) {
        if (!control) return null;

        const settings = options || {};
        const group = settings.group || control.parentElement;
        if (!group) return null;

        const errorEl = settings.errorEl || document.createElement('div');
        if (!settings.errorEl) {
            errorEl.className = 'rq-control-error';
            group.appendChild(errorEl);
        } else {
            errorEl.classList.add('rq-control-error');
        }

        const state = {
            touched: false
        };

        group.classList.add('rq-control-group');
        control.classList.add('rq-control');

        function getValue() {
            if (typeof settings.getValue === 'function') {
                return settings.getValue(control);
            }
            if (control.type === 'checkbox') {
                return control.checked;
            }
            return control.value;
        }

        function hasValue(value) {
            if (typeof settings.hasValue === 'function') {
                return settings.hasValue(value, control);
            }
            return hasTextValue(control, value);
        }

        function validateValue(value) {
            if (typeof settings.validate === 'function') {
                return normalizeResult(settings.validate(value, control), settings.requiredMessage);
            }
            if (settings.required === false || hasValue(value)) {
                return { valid: true, message: '' };
            }
            return {
                valid: false,
                message: settings.requiredMessage || '입력값을 확인해 주세요.'
            };
        }

        function setStateClass(stateName) {
            group.classList.remove(
                'rq-state-default',
                'rq-state-focus',
                'rq-state-typing',
                'rq-state-error',
                'rq-state-success'
            );
            group.classList.add(`rq-state-${stateName}`);
        }

        function refresh(reason) {
            const value = getValue();
            const filled = hasValue(value);
            const validation = validateValue(value);
            const isFocused = document.activeElement === control;
            const allowTypingState = settings.useTypingState !== false;
            const shouldShowErrorNow = typeof settings.shouldShowError === 'function'
                ? settings.shouldShowError({
                    reason: reason,
                    value: value,
                    control: control,
                    filled: filled,
                    validation: validation,
                    touched: state.touched
                })
                : false;
            const showError = !validation.valid && (
                shouldShowErrorNow ||
                reason === 'submit' ||
                state.touched ||
                (settings.showErrorOnInput && filled)
            );

            let stateName = 'default';
            if (showError) {
                stateName = 'error';
            } else if (isFocused && allowTypingState && filled) {
                stateName = 'typing';
            } else if (isFocused) {
                stateName = 'focus';
            } else if (filled && validation.valid) {
                stateName = 'success';
            }

            setStateClass(stateName);
            errorEl.textContent = showError ? validation.message : '';
            errorEl.hidden = !showError;

            return validation.valid;
        }

        control.addEventListener('focus', function () {
            refresh('focus');
        });

        control.addEventListener('input', function () {
            refresh('input');
        });

        control.addEventListener('change', function () {
            refresh('change');
        });

        control.addEventListener('blur', function () {
            state.touched = true;
            refresh('blur');
        });

        refresh('init');

        return {
            refresh: refresh,
            validate: function (reason) {
                if (reason === 'submit') {
                    state.touched = true;
                }
                return refresh(reason || 'submit');
            },
            markTouched: function () {
                state.touched = true;
                return refresh('blur');
            }
        };
    }

    window.RequestInputState = {
        attach: attach
    };
})();
