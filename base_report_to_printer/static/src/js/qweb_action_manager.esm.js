import {registry} from "@web/core/registry";

const DESTROYED_MESSAGE = "Component is destroyed";

/**
 * Printing server-side can take several seconds, so the component that asked
 * for the print is often gone by the time the handler returns.
 * `_executeReportAction` then calls `options.onClose`, which on a form reloads
 * the record, and `useService` rejects with "Component is destroyed" when the
 * component was already destroyed before that call started. Nothing catches
 * the rejection, so a print that actually succeeded surfaces as an error
 * dialog.
 *
 * Core already treats a component destroyed mid-call as a no-op; do the same
 * for this case. Any other failure still propagates.
 *
 * @param {Object} options `doAction` options, mutated in place.
 */
function ignoreDestroyedComponent(options) {
    if (!options || !options.onClose) {
        return;
    }
    const onClose = options.onClose;
    options.onClose = (...args) =>
        Promise.resolve()
            .then(() => onClose(...args))
            .catch((error) => {
                if (error && error.message === DESTROYED_MESSAGE) {
                    return undefined;
                }
                throw error;
            });
}

async function genericReportActionHandler(action, options, env) {
    const orm = env.services.orm;
    if (!["qweb-pdf", "qweb-text"].includes(action.report_type)) {
        return false;
    }

    const dispatchers = registry.category("report.print.backends");

    const result = await orm.call(
        "ir.actions.report",
        "print_action_for_report_name",
        [action.report_name],
        {context: env.context}
    );

    if (!result || result.action !== "server") {
        return false;
    }

    const backend = result.backend;

    if (backend && dispatchers.contains(backend)) {
        const dispatcher = dispatchers.get(backend);
        ignoreDestroyedComponent(options);
        return await dispatcher(action, env);
    }

    return false;
}

registry
    .category("ir.actions.report handlers")
    .add("generic_report_action_handler", genericReportActionHandler, {sequence: 0});
