/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import React, { useCallback, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Form } from 'semantic-ui-react';
import { useClickAwayListener } from '../../../lib/hooks';

import selectors from '../../../selectors';
import entryActions from '../../../entry-actions';
import { useNestedRef } from '../../../hooks';
import MarkdownEditor from '../MarkdownEditor';

import styles from './EditMarkdown.module.scss';

// Images are now stored as separate files (not inline base64), so we maintain
// the original 1MB limit for text content. Legacy base64 images will be migrated
// to file storage automatically on save.
const MAX_LENGTH = 1048576; // 1MB

const EditMarkdown = React.memo(({ cardId, defaultValue, draftValue, onUpdate, onClose }) => {
  const defaultMode = useSelector((state) => selectors.selectCurrentUser(state).defaultEditorMode);

  const dispatch = useDispatch();
  const [t] = useTranslation();
  const [value, setValue] = useState(() => draftValue || defaultValue || '');

  const fieldRef = useRef(null);
  const [submitButtonRef, handleSubmitButtonRef] = useNestedRef();
  const [cancelButtonRef, handleCancelButtonRef] = useNestedRef();

  const handleModeChange = useCallback(
    (mode) => {
      dispatch(
        entryActions.updateCurrentUser({
          defaultEditorMode: mode,
        }),
      );
    },
    [dispatch],
  );

  const isExceeded = value.length > MAX_LENGTH;

  const submit = useCallback(() => {
    // Get the current value directly from the editor to ensure we have the latest content
    // This is important because the editor might not have fired change events yet
    // after async operations like image uploads
    const currentValue = fieldRef.current?.getValue ? fieldRef.current.getValue() : value;
    const cleanValue = currentValue.trim() || null;

    // Always allow update - server will migrate base64 images to files
    if (cleanValue !== defaultValue) {
      onUpdate(cleanValue);
    }

    onClose(null);
  }, [onUpdate, onClose, defaultValue, value]);

  const handleChange = useCallback((nextValue) => {
    setValue(nextValue);
  }, []);

  const handleSubmit = useCallback(() => {
    submit();
  }, [submit]);

  const handleCancel = useCallback(() => {
    submit();
  }, [submit]);

  const handleCancelClick = useCallback(() => {
    onClose(null);
  }, [onClose]);

  const handleClickAwayCancel = useCallback(() => {
    fieldRef.current.focus();
  }, [fieldRef]);

  const clickAwayProps = useClickAwayListener(
    [fieldRef, submitButtonRef, cancelButtonRef],
    submit,
    handleClickAwayCancel,
  );

  return (
    <>
      <MarkdownEditor
        {...clickAwayProps} // eslint-disable-line react/jsx-props-no-spreading
        ref={fieldRef}
        cardId={cardId}
        defaultValue={value}
        defaultMode={defaultMode}
        isError={isExceeded}
        onChange={handleChange}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onModeChange={handleModeChange}
      />
      <Form onSubmit={handleSubmit}>
        <div className={styles.controls}>
          <Button
            {...clickAwayProps} // eslint-disable-line react/jsx-props-no-spreading
            positive
            ref={handleSubmitButtonRef}
            content={t('action.save')}
          />
          {isExceeded && (
            <span className={styles.warning}>
              {t('common.contentExceedsLimit', {
                limit: '1MB',
              })}
            </span>
          )}
          <Button
            {...clickAwayProps} // eslint-disable-line react/jsx-props-no-spreading
            ref={handleCancelButtonRef}
            type="button"
            content={t('action.cancel')}
            onClick={handleCancelClick}
          />
        </div>
      </Form>
    </>
  );
});

EditMarkdown.propTypes = {
  cardId: PropTypes.string,
  defaultValue: PropTypes.string,
  draftValue: PropTypes.string,
  // placeholder: PropTypes.string.isRequired, // TODO: remove?
  onUpdate: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

EditMarkdown.defaultProps = {
  cardId: undefined,
  defaultValue: undefined,
  draftValue: undefined,
};

export default EditMarkdown;
