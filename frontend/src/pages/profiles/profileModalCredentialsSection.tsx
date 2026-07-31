import { Checkbox, Input, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import styles from './ProfileModal.module.css'
import {
	countConfiguredValues,
	profileFieldA11y,
	renderAdvancedFieldDisclosure,
	type ProfileModalSectionContentArgs,
} from './profileModalSectionShared'

export function buildCredentialsSection(args: ProfileModalSectionContentArgs) {
	const { values, errors, editMode, setField, viewState } = args

	return (
		<div className={styles.sectionBody}>
			{editMode ? (
				<Typography.Text type="secondary" className={styles.sectionNote}>
					Leave blank to keep stored credentials.
				</Typography.Text>
			) : null}

			{viewState.isS3Provider ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Access Key ID" htmlFor="profile-access-key-id" required={!editMode} error={errors.accessKeyId}>
							<Input
								{...profileFieldA11y('profile-access-key-id', errors.accessKeyId)}
								value={values.accessKeyId}
								onChange={(e) => setField('accessKeyId', e.target.value)}
								autoComplete="username"
							/>
						</FormField>
						<FormField label="Secret" htmlFor="profile-secret-access-key" required={!editMode} error={errors.secretAccessKey}>
							<Input.Password
								{...profileFieldA11y('profile-secret-access-key', errors.secretAccessKey)}
								value={values.secretAccessKey}
								onChange={(e) => setField('secretAccessKey', e.target.value)}
								autoComplete="new-password"
							/>
						</FormField>
					</div>

					{editMode
						? renderAdvancedFieldDisclosure({
								title: 'Session token',
								description: 'Only when issued.',
								configuredCount: countConfiguredValues([values.sessionToken]),
								children: (
									<>
										<div className={styles.formGrid}>
											<FormField label="Session Token" htmlFor="profile-session-token">
												<Input.Password
													id="profile-session-token"
													value={values.sessionToken ?? ''}
													onChange={(e) => setField('sessionToken', e.target.value)}
													autoComplete="off"
													disabled={!!editMode && !!values.clearSessionToken}
												/>
											</FormField>
										</div>
										{editMode ? (
											<div className={styles.checkboxRow}>
												<Checkbox checked={!!values.clearSessionToken} onChange={(e) => setField('clearSessionToken', e.target.checked)}>
													Clear existing session token
												</Checkbox>
											</div>
										) : null}
									</>
								),
							})
						: renderAdvancedFieldDisclosure({
								title: 'Session token',
								description: 'Only for temporary credentials.',
								configuredCount: countConfiguredValues([values.sessionToken]),
								children: (
									<FormField label="Session Token" htmlFor="profile-session-token">
										<Input.Password
											id="profile-session-token"
											value={values.sessionToken ?? ''}
											onChange={(e) => setField('sessionToken', e.target.value)}
											autoComplete="off"
										/>
									</FormField>
								),
							})}
				</>
			) : null}

			{viewState.isAzure ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Account Key" htmlFor="profile-azure-account-key" required={!editMode} error={errors.azureAccountKey}>
							<Input.Password
								{...profileFieldA11y('profile-azure-account-key', errors.azureAccountKey)}
								value={values.azureAccountKey}
								onChange={(e) => setField('azureAccountKey', e.target.value)}
								autoComplete="new-password"
							/>
						</FormField>
					</div>
					{renderAdvancedFieldDisclosure({
						title: 'Azure management-plane secret',
						description: 'Only with Azure ARM fields.',
						configuredCount: countConfiguredValues([values.azureClientSecret]),
						children: (
							<div className={styles.formGrid}>
								<FormField label="Client Secret (optional)" htmlFor="profile-azure-client-secret" error={errors.azureClientSecret}>
									<Input.Password
										{...profileFieldA11y('profile-azure-client-secret', errors.azureClientSecret)}
										value={values.azureClientSecret}
										onChange={(e) => setField('azureClientSecret', e.target.value)}
										autoComplete="new-password"
									/>
								</FormField>
							</div>
						),
					})}
				</>
			) : null}

			{viewState.isGcp ? (
				<>
					<div className={styles.toggleGrid}>
						{args.renderSwitchCard({
							title: 'Anonymous',
							description: 'Skip credentials and only use public access.',
							checked: values.gcpAnonymous,
							onChange: (checked) => setField('gcpAnonymous', checked),
							ariaLabel: 'Anonymous',
						})}
					</div>

					{values.gcpAnonymous ? (
						<Typography.Text type="secondary" className={styles.sectionNote}>
							Only when the endpoint allows public access. Project Number is still required.
						</Typography.Text>
					) : (
						<FormField label="Service Account Key" htmlFor="profile-gcp-service-account-json" required={!editMode} error={errors.gcpServiceAccountJson}>
							<Input.TextArea
								{...profileFieldA11y('profile-gcp-service-account-json', errors.gcpServiceAccountJson)}
								className={styles.compactTextArea}
								value={values.gcpServiceAccountJson}
								onChange={(e) => setField('gcpServiceAccountJson', e.target.value)}
								autoSize={{ minRows: 6, maxRows: 12 }}
								placeholder="Paste the service account JSON key."
							/>
						</FormField>
					)}
				</>
			) : null}

			{viewState.isOciObjectStorage ? (
				<>
					{renderAdvancedFieldDisclosure({
						title: 'OCI credential overrides',
						description: 'Only for a custom auth provider or config path.',
						configuredCount: countConfiguredValues([values.ociAuthProvider, values.ociConfigFile, values.ociConfigProfile]),
						children: (
							<div className={styles.formGrid}>
								<FormField label="Auth Provider" htmlFor="profile-oci-auth-provider">
									<Input
										id="profile-oci-auth-provider"
										value={values.ociAuthProvider}
										onChange={(e) => setField('ociAuthProvider', e.target.value)}
										placeholder="user_principal_auth / instance_principal / api_key / resource_principal"
									/>
								</FormField>
								<FormField label="Config File" htmlFor="profile-oci-config-file">
									<Input
										id="profile-oci-config-file"
										value={values.ociConfigFile}
										onChange={(e) => setField('ociConfigFile', e.target.value)}
										placeholder="/home/user/.oci/config"
									/>
								</FormField>
								<FormField label="Config Profile" htmlFor="profile-oci-config-profile">
									<Input
										id="profile-oci-config-profile"
										value={values.ociConfigProfile}
										onChange={(e) => setField('ociConfigProfile', e.target.value)}
										placeholder="DEFAULT"
									/>
								</FormField>
							</div>
						),
					})}
				</>
			) : null}
		</div>
	)
}
