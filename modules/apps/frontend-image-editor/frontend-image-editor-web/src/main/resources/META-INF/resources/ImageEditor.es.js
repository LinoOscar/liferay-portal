import Soy from 'metal-soy';
import dom from 'metal-dom';
import { CancellablePromise } from 'metal-promise';
import { async, core } from 'metal';
import PortletBase from 'frontend-js-web/liferay/PortletBase.es';

import 'frontend-js-web/liferay/compat/dropdown/Dropdown.es';
import ImageEditorHistoryEntry from './ImageEditorHistoryEntry.es';
import ImageEditorLoading from './ImageEditorLoading.es';
import templates from './ImageEditor.soy';

/**
 * ImageEditor
 *
 * This class bootstraps all the necessary parts of an image editor. It only controls
 * the state and history of the editing process, orchestrating how the different parts
 * of the application work.
 *
 * All image processing is delegated to the different image editor capability implementations. The
 * editor provides:
 * - A common way of exposing the functionality.
 * - Some registration points which can be used by the image editor capability implementors
 * to provide UI controls.
 * @review
 */
class ImageEditor extends PortletBase {
	/**
	 * @inheritDoc
	 * @review
	 */
	attached() {
		/**
		 * This index points to the current state in the history.
		 * @protected
		 * @review
		 * @type {Number}
		 */
		this.historyIndex_ = 0;

		/**
		 * History of the different image states during edition. Every
		 * entry entry represents a change to the image on top of the
		 * previous one.
		 * - History entries are objects with
		 *     - url (optional): the url representing the image
		 *     - data: the ImageData object of the image
		 * @protected
		 * @review
		 * @type {Array.<Object>}
		 */
		this.history_ = [
			new ImageEditorHistoryEntry(
				{
					url: this.image
				}
			)
		];

		// Polyfill svg usage for lexicon icons
		svg4everybody(
			{
				attributeName: 'data-href',
				polyfill: true
			}
		);

		// Load the first entry imageData and render it on the app.
		this.history_[0].getImageData()
			.then((imageData) => {
				async.nextTick(() => {
					this.imageEditorReady = true;

					this.syncImageData_(imageData);
				});
			});
	}

	/**
	 * Accepts the current changes applied by the active control and creates
	 * a new entry in the history stack. Doing this will wipe out any
	 * stale redo states.
	 * @review
	 */
	accept() {
		let selectedControl = this.components[this.id + '_selected_control_' + this.selectedControl.variant];

		this.history_[this.historyIndex_].getImageData()
			.then((imageData) => selectedControl.process(imageData))
			.then((imageData) => this.createHistoryEntry_(imageData))
			.then(() => this.syncHistory_())
			.then(() => {
				this.selectedControl = null;
				this.selectedTool = null;
			});
	}

	/**
	 * Notifies the opener app that the user wants to close the
	 * editor without saving the changes
	 * @protected
	 * @review
	 */
	close_() {
		Liferay.Util.getWindow().hide();
	}

	/**
	 * Creates a new history entry state.
	 * @param  {ImageData} imageData The ImageData of the new image.
	 * @protected
	 * @review
	 */
	createHistoryEntry_(imageData) {
		// Push new state and discard stale redo states
		this.historyIndex_++;
		this.history_.length = this.historyIndex_ + 1;
		this.history_[this.historyIndex_] = new ImageEditorHistoryEntry({data: imageData});

		return CancellablePromise.resolve();
	}

	/**
	 * Discards the current changes applied by the active control and reverts
	 * the image to its state before the control activation.
	 * @review
	 */
	discard() {
		this.selectedControl = null;
		this.selectedTool = null;
		this.syncHistory_();
	}

	/**
	 * Retrieves the editor canvas DOM node.
	 * @return {Element} The canvas element.
	 * @review
	 */
	getImageEditorCanvas() {
		return this.element.querySelector('.lfr-image-editor-image-container canvas');
	}

	/**
	 * Retrieves the Blob representation of the current image.
	 * @return {CancellablePromise} A promise that will resolve with the image blob.
	 * @review
	 */
	getImageEditorImageBlob() {
		return new CancellablePromise((resolve, reject) => {
			this.getImageEditorImageData()
				.then(imageData => {
					let canvas = document.createElement('canvas');
					canvas.width = imageData.width;
					canvas.height = imageData.height;

					canvas.getContext('2d').putImageData(imageData, 0, 0);

					if (canvas.toBlob) {
						canvas.toBlob(resolve, this.saveMimeType);
					}
					else {
						let data = atob(canvas.toDataURL(this.saveMimeType).split(',')[1]);
						let length = data.length;
						let bytes = new Uint8Array(length);

						for (let i = 0; i < length; i++) {
							bytes[i] = data.charCodeAt(i);
						}

						resolve(new Blob([bytes], {type: this.saveMimeType}));
					}
				});
		});
	}

	/**
	 * Retrieves the ImageData representation of the current image.
	 * @return {CancellablePromise} A promise that will resolve with the image data.
	 * @review
	 */
	getImageEditorImageData() {
		return this.history_[this.historyIndex_].getImageData();
	}

	/**
	 * Normalizes different mime types to the most similar mime type
	 * available to canvas implementations.
	 * @param  {String} mimeType Original mime type
	 * @return {String} The normalized mime type
	 * @review
	 * @see http://kangax.github.io/jstests/toDataUrl_mime_type_test/
	 */
	normalizeCanvasMimeType_(mimeType) {
		return mimeType.replace('jpg', 'jpeg');
	}

	/**
	 * Notifies the opener app of the result of the save action
	 * @param  {Object} result The server response to the save action
	 * @protected
	 * @review
	 */
	notifySaveResult_(result) {
		this.components.loading.show = false;

		if (result && result.success) {
			Liferay.Util.getOpener().Liferay.fire(
				this.saveEventName,
				{
					data: result
				}
			);

			Liferay.Util.getWindow().hide();
		}
		else if (result.error) {
			this.showError_(result.error.message);
		}
	}

	/**
	 * Updates the image back to a previously undone state in the history.
	 * Redoing an action recovers the undone image changes and enables the
	 * undo stack in case the user wants to undo the changes again.
	 * @review
	 */
	redo() {
		this.historyIndex_++;
		this.syncHistory_();
	}

	/**
	 * Selects a control and starts the edition phase for it.
	 * @param  {MouseEvent} event
	 * @review
	 */
	requestImageEditorEdit(event) {
		let controls = this.imageEditorCapabilities.tools.reduce(
			(prev, curr) => prev.concat(curr.controls), []);

		let target = event.delegateTarget || event.currentTarget;
		let targetControl = target.getAttribute('data-control');
		let targetTool = target.getAttribute('data-tool');

		this.syncHistory_()
			.then(() => {
				this.selectedControl = controls.filter(tool => tool.variant === targetControl)[0];
				this.selectedTool = targetTool;
			});
	}

	/**
	 * Queues a request for a preview process of the current image by the
	 * currently selected control.
	 * @review
	 */
	requestImageEditorPreview() {
		let selectedControl = this.components[this.id + '_selected_control_' + this.selectedControl.variant];

		this.history_[this.historyIndex_].getImageData()
			.then((imageData) => selectedControl.preview(imageData))
			.then((imageData) => this.syncImageData_(imageData));

		this.components.loading.show = true;
	}

	/**
	 * Discards all changes and restores the original state of the image.
	 * Unlike the undo/redo methods, reset will wipe out all the history.
	 * @review
	 */
	reset() {
		this.historyIndex_ = 0;
		this.history_.length = 1;
		this.syncHistory_();
	}

	/**
	 * Tries to save the current image using the provided save url.
	 * @param {MouseEvent} event The MouseEvent that triggered the save action
	 * @protected
	 * @review
	 */
	save_(event) {
		if (!event.delegateTarget.disabled) {
			this.getImageEditorImageBlob()
				.then((imageBlob) => this.submitBlob_(imageBlob))
				.then((result) => this.notifySaveResult_(result))
				.catch((error) => this.showError_(error));
		}
	}

	/**
	 * Setter function for the `saveMimeType` state key
	 * @param  {!String} saveMimeType The optional passed value for the attribute
	 * @protected
	 * @return {String} The computed value for the attribute
	 * @review
	 */
	setterSaveMimeTypeFn_(saveMimeType) {
		if (!saveMimeType) {
			const imageExtensionRegex = /(?:.*:\/\/)?(?:[^\/])*[^.]*.([^?\/$]*)/;
			const imageExtension = this.image.match(imageExtensionRegex)[1];

			saveMimeType = `image/${imageExtension}`;
		}

		return this.normalizeCanvasMimeType_(saveMimeType);
	}

	/**
	 * Shows an error message in the editor
	 * @param  {String} message The error message to show
	 * @protected
	 * @review
	 */
	showError_(message) {
		this.components.loading.show = false;

		AUI().use('liferay-alert', () => {
			new Liferay.Alert(
				{
					delay: {
						hide: 2000,
						show: 0
					},
					duration: 3000,
					icon: 'exclamation-circle',
					message: message.message,
					type: 'danger'
				}
			).render(this.element);
		});
	}

	/**
	 * Sends a given image blob to the server for processing
	 * and storing.
	 * @param  {Blob} imageBlob The image blob to send to the server
	 * @protected
	 * @return {CancellablePromise} A promise that follows the xhr submission process
	 * @review
	 */
	submitBlob_(imageBlob) {
		let saveFileName = this.saveFileName;
		let saveParamName = this.saveParamName;

		let promise = new CancellablePromise((resolve, reject) => {
			let formData = new FormData();

			formData.append(saveParamName, imageBlob, saveFileName);

			this.fetch(this.saveURL, formData)
				.then(response => response.json())
				.then(resolve)
				.catch(error => reject(error));
		});

		this.components.loading.show = true;

		return promise;
	}

	/**
	 * Syncs the image and history values after changes to the
	 * history stack.
	 * @protected
	 * @review
	 */
	syncHistory_() {
		return new CancellablePromise((resolve, reject) => {
			this.history_[this.historyIndex_].getImageData()
				.then((imageData) => {
					this.syncImageData_(imageData);

					this.history = {
						canRedo: this.historyIndex_ < this.history_.length - 1,
						canReset: this.history_.length > 1,
						canUndo: this.historyIndex_ > 0
					};

					resolve();
				});
		});
	}

	/**
	 * Updates the image data showed in the editable area
	 * @param  {ImageData} imageData The new ImageData value to show on the editor
	 * @protected
	 * @review
	 */
	syncImageData_(imageData) {
		let width = imageData.width;
		let height = imageData.height;

		let aspectRatio = width / height;

		let offscreenCanvas = document.createElement('canvas');
		offscreenCanvas.width = width;
		offscreenCanvas.height = height;

		let offscreenContext = offscreenCanvas.getContext('2d');
		offscreenContext.clearRect(0, 0, width, height);
		offscreenContext.putImageData(imageData, 0, 0);

		let canvas = this.getImageEditorCanvas();

		let boundingBox = dom.closest(this.element, '.portlet-layout');
		let availableWidth = boundingBox.offsetWidth;

		let dialogFooterHeight = 0;
		let dialogFooter = this.element.querySelector('.dialog-footer');

		if (dialogFooter) {
			dialogFooterHeight = dialogFooter.offsetHeight;
		}

		let availableHeight = boundingBox.offsetHeight - 142 - 40 - dialogFooterHeight;
		let availableAspectRatio = availableWidth / availableHeight;

		if (availableAspectRatio > 1) {
			canvas.height = availableHeight;
			canvas.width = aspectRatio * availableHeight;
		} else {
			canvas.width = availableWidth;
			canvas.height = availableWidth / aspectRatio;
		}

		let context = canvas.getContext('2d');
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(offscreenCanvas, 0, 0, width, height, 0, 0, canvas.width, canvas.height);

		canvas.style.width = canvas.width + 'px';
		canvas.style.height = canvas.height + 'px';

		this.components.loading.show = false;
	}

	/**
	 * Reverts the image to the previous state in the history. Undoing
	 * an action brings back the previous version of the image and enables
	 * the redo stack in case the user wants to reapply the change again.
	 * @review
	 */
	undo() {
		this.historyIndex_--;
		this.syncHistory_();
	}
}

/**
 * State definition.
 * @review
 * @static
 * @type {!Object}
 */
ImageEditor.STATE = {
	/**
	 * Indicates that the editor is ready for user interaction
	 * @review
	 * @type {Object}
	 */
	imageEditorReady: {
		validator: core.isBoolean,
		value: false
	},

	/**
	 * Event to dispatch when the edition has been completed
	 * @review
	 * @type {String}
	 */
	saveEventName: {
		validator: core.isString
	},

	/**
	 * Name of the saved image that should be sent
	 * to the server for the save action
	 * @review
	 * @type {String}
	 */
	saveFileName: {
		validator: core.isString
	},

	/**
	 * Mime type of the saved image. If not explicitly set,
	 * the image mime type will be infered from the image url.
	 * @review
	 * @type {String}
	 */
	saveMimeType: {
		setter: 'setterSaveMimeTypeFn_',
		validator: core.isString
	},

	/**
	 * Name of the param where the image should be sent
	 * to the server for the save action
	 * @review
	 * @type {String}
	 */
	saveParamName: {
		validator: core.isString
	},

	/**
	 * Url to save the image changes
	 * @review
	 * @type {String}
	 */
	saveURL: {
		validator: core.isString
	}
};

Soy.register(ImageEditor, templates);

export default ImageEditor;