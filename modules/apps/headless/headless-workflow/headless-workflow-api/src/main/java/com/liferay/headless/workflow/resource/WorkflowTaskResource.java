/**
 * Copyright (c) 2000-present Liferay, Inc. All rights reserved.
 *
 * This library is free software; you can redistribute it and/or modify it under
 * the terms of the GNU Lesser General Public License as published by the Free
 * Software Foundation; either version 2.1 of the License, or (at your option)
 * any later version.
 *
 * This library is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more
 * details.
 */

package com.liferay.headless.workflow.resource;

import com.liferay.headless.workflow.dto.WorkflowTask;
import com.liferay.headless.workflow.dto.WorkflowTaskCollection;
import com.liferay.oauth2.provider.scope.RequiresScope;
import com.liferay.portal.vulcan.context.Pagination;

import javax.annotation.Generated;

import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.Context;

/**
 * @author Javier Gamarra
 * @generated
 */
@Generated("")
@Path("/1.0.0/workflow-task")
public interface WorkflowTaskResource {

	@GET
	@Produces("application/json")
	@RequiresScope("headless-workflow-application.read")
	public WorkflowTaskCollection<WorkflowTask> getWorkflowTaskCollection(
			@Context Pagination pagination, @QueryParam("size") String size)
		throws Exception;

}